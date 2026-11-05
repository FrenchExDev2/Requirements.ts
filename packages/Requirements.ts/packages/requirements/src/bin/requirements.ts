#!/usr/bin/env node
/**
 * requirements CLI — query gaps, matrix, chain, scaffold tests.
 *
 * Discovers the consumer project's context via requirements.config.json,
 * then delegates to the pure query/scaffold cores.
 */

import { Command } from 'commander';
import { loadCodeTrace, explainCode } from '@frenchexdev2/requirements-trace/code-trace';
import * as path from 'path';
import { pathToFileURL } from 'node:url';
import { promises as fsp } from 'fs';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(execCb);
import {
  queryGaps,
  queryMatrix,
  queryChain,
  buildTraceIndex,
  renderGaps,
  renderMatrix,
  renderChain,
  type TraceFormatter,
  runTraceGraph,
  type RequirementNodeInput,
} from '@frenchexdev2/requirements-trace';
import { buildScaffoldResult } from '@frenchexdev2/requirements-scaffolders';
import {
  readFeatures,
  qualifyProject,
  readRequirements,
  deriveTraceabilityCorpus,
  scanTestFiles,
  generateReport,
  buildJsonPayload,
  buildByTestJson,
  renderConsole,
  renderByTest,
} from '@frenchexdev2/requirements-compliance';
import type { CommandRunner, FileSystem, Vcs } from '../ports/external.js';

// ── Phase 2 wiring: wizard + sync + schema register ─────────────────────────
import { runFeatureWizard, runRequirementWizard, orphanFeatureSpecs, uncoveredApprovedRequirements,
  findOrphanFeatures, traceChainFor, buildSatisfiedByIndex,
  orchestrateSpecWizard,
  type FeatureLinkView, type RequirementStatusView } from '@frenchexdev2/requirements-wizards';
import { detectVersionDrift, type VersionPin } from '@frenchexdev2/requirements-versioning';
import type { VersionedRequirementSpec } from '@frenchexdev2/requirements-wizards';
import { scanTestSmells, type TestSmell } from '@frenchexdev2/requirements-lib/analysis';
import {
  parseTestFile,
  collectTestFiles,
  buildFileExistsPredicate,
  planBehavioralCheck,
  buildStrykerConfig,
  classifyVerdict,
  aggregateByAc,
  type TestParseResult,
  type BehavioralCheckPlan,
  type MutationReport,
  type BehavioralAuditEntry,
} from '@frenchexdev2/requirements-lib/analysis';
import { runStrykerForPlan } from '../cli/behavioral-check-runner.js';
import { startWatch, type FileWatcher } from '@frenchexdev2/requirements-core/watch-core';
import { validateSpec } from '@frenchexdev2/requirements-spec-io/schema-generate';
import { watch as fsWatch } from 'node:fs';
import { realPrompt, openInEditor } from '../cli/prompt-shell.js';
import { registerSchema } from '@frenchexdev2/requirements-spec-io';
import { renameFeature as runRenameFeature, renameRequirement as runRenameRequirement, RenameError } from '../cli/rename-core.js';
import type { RequirementStyle } from '@frenchexdev2/requirements-core';
import type { FeatureSpec, RequirementSpec, Spec, FeatureId, RequirementId } from '@frenchexdev2/requirements-core/types';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';

interface RequirementsConfig {
  featuresDir: string;
  requirementsDir: string;
  bindingsDir: string;
  testDirs: string[];
  /** Per-level scaffold output dir override. Falls back to each scaffolder's defaultDir. */
  testDirsByLevel?: Partial<Record<'unit' | 'functional' | 'e2e' | 'a11y' | 'i18n' | 'visual' | 'perf', string>>;
  bindingsManifestPath?: string;
  inferredManifestPath?: string;
  inferredDiffPath?: string;
  reportsDir?: string;
  /**
   * Path prefixes (posix, relative to root) the bindings scanner records
   * targets for. Omitted → the scanner's own default (`src/`, `scripts/`).
   * Widen it when coverage is measured outside those trees, otherwise those
   * files sit in the orphan universe with no way to leave it.
   */
  includeScopes?: string[];
  /** Module specifier for a project-supplied RequirementStyle (defaults to DefaultStyle). */
  style?: string;
  /** Requirement revision pins consumed by strict static version-drift analysis. */
  versionPins?: readonly VersionPin[];
}

const DEFAULTS: RequirementsConfig = {
  featuresDir: 'requirements/features',
  requirementsDir: 'requirements/requirements',
  bindingsDir: 'requirements/bindings',
  testDirs: ['test/unit', 'test/functional', 'test/e2e', 'test/a11y', 'test/i18n', 'test/visual', 'test/perf'],
  bindingsManifestPath: 'requirements-bindings.json',
  inferredManifestPath: 'requirements-bindings.inferred.json',
  inferredDiffPath: 'requirements-bindings.diff.json',
  reportsDir: 'docs/compliance',
};

async function loadConfig(root: string): Promise<RequirementsConfig> {
  for (const name of ['requirements.config.json', 'typed-fsm.config.json']) {
    try {
      const raw = await fsp.readFile(path.join(root, name), 'utf8');
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch { /* try next */ }
  }
  return DEFAULTS;
}

const realFs: FileSystem = {
  readFile: (p: string) => fsp.readFile(p, 'utf8'),
  writeFile: (p: string, d: string) => fsp.writeFile(p, d, 'utf8'),
  exists: async (p: string) => { try { await fsp.stat(p); return true; } catch { return false; } },
  readdir: (p: string) => fsp.readdir(p),
  stat: (p: string) => fsp.stat(p),
  mkdir: (p: string) => fsp.mkdir(p, { recursive: true }).then(() => {}),
};

const fmt: TraceFormatter = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

function output(title: string, lines: string[], json: boolean, data: unknown): void {
  if (json) console.log(JSON.stringify(data, null, 2));
  else { console.log(`\n  ${fmt.bold(title)}\n`); for (const l of lines) console.log(`  ${l}`); console.log(''); }
}

/** Build an independent command tree for embedding and executable contract tests. */
export function createRequirementsProgram(): Command {
const program = new Command()
  .name('requirements')
  .description('Requirements tracking — gaps, matrix, chain, scaffold')
  .version('0.1.0');

program.command('qualify')
  .description('Qualify the complete declared corpus using retained Windows and Linux execution evidence')
  .option('--strict', 'Fail unless all qualification obligations are verified (always enforced)')
  .option('--json', 'Print the complete versioned qualification report')
  .option('--evidence <files...>', 'Selected version-1 evidence files, one per platform')
  .action(async (opts: { strict?: boolean; json?: boolean; evidence?: string[] }) => {
    const report = await qualifyProject({ root: process.cwd(), evidencePaths: opts.evidence });
    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Qualification: ${report.state}; ${report.inventory.requirements} Requirements, ${report.inventory.acs} ACs, ${report.diagnostics.length} diagnostics`);
      for (const diagnostic of report.diagnostics.slice(0, 20)) console.log(`${diagnostic.code}: ${diagnostic.subject} — ${diagnostic.message}`);
    }
    if (!report.complete) process.exitCode = 1;
  });

const trace = program.command('trace').description('Traceability queries');
trace.command('explain <location>')
  .description('Explain declared participation at file:line and report evidence validity')
  .option('--config <file>', 'JSON code-trace configuration', '.requirements.json')
  .option('--json', 'JSON output')
  .action(async (location: string, opts: { config: string; json?: boolean }) => {
    const match = /^(.*):(\d+)$/.exec(location);
    if (!match) throw new Error('Expected file:line');
    const project = await loadCodeTrace(path.resolve(opts.config));
    const result = explainCode(project, path.resolve(match[1]!), Number(match[2]));
    console.log(opts.json ? JSON.stringify(result, null, 2) : [result.message, ...result.features.map(f => `${f.id}: ${f.requirement.id} — ${f.requirement.rationale}`), `Evidence: ${result.evidenceState}`].join('\n'));
  });

trace.command('gaps')
  .description('Show all traceability gaps (uncovered ACs by test level)')
  .option('--json', 'JSON output')
  .action(async (opts: { json?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const features = await readFeatures(path.join(root, config.featuresDir));
    const testRefs = await scanTestFiles(config.testDirs.map(d => path.join(root, d)), root, realFs);
    const index = buildTraceIndex(features, {}, testRefs);
    const report = queryGaps(index, [], features, testRefs);
    output('Traceability Gaps', renderGaps(report, fmt), !!opts.json, report);
  });

trace.command('matrix <id>')
  .description('AC x TestLevel matrix for a feature')
  .option('--json', 'JSON output')
  .action(async (id: string, opts: { json?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const features = await readFeatures(path.join(root, config.featuresDir));
    const testRefs = await scanTestFiles(config.testDirs.map(d => path.join(root, d)), root, realFs);
    const result = queryMatrix(id, null as any, features, testRefs, []);
    if (!result) { console.error(`Feature '${id}' not found.`); process.exit(1); }
    output(`Matrix: ${id}`, renderMatrix(result, fmt), !!opts.json, result);
  });

trace.command('graph')
  .description('Render REQ→FEAT→AC→TEST DAG as Mermaid (default) or Graphviz DOT')
  .option('--format <fmt>', 'Output format: mermaid | dot', 'mermaid')
  .option('--output <file>', 'Write to file instead of stdout')
  .action(async (opts: { format?: string; output?: string }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const testRefs = await scanTestFiles(config.testDirs.map(d => path.join(root, d)), root, realFs);
    const { features: featureSpecs, requirements: requirementSpecs } = await loadAllSpecs(root, config);
    const reqInputs: RequirementNodeInput[] = requirementSpecs.map(r => ({
      id: r.id,
      title: r.title,
      satisfiedBy: featureSpecs.filter(f => (f.satisfies ?? []).includes(r.id)).map(f => f.id),
      refines: r.refines,
    }));
    const result = await runTraceGraph(
      {
        root,
        featuresDir: path.join(root, config.featuresDir),
        format: opts.format,
        output: opts.output ? path.resolve(root, opts.output) : undefined,
        requirements: reqInputs,
        testRefs,
      },
      {
        fs: realFs,
        stdout: { write: (s: string) => { process.stdout.write(s); }, isTty: () => Boolean(process.stdout.isTTY) },
        stderr: { write: (s: string) => { process.stderr.write(s); }, isTty: () => Boolean(process.stderr.isTTY) },
        logger: {
          info: (m: string) => console.error(m),
          warn: (m: string) => console.error(fmt.yellow(`  ! ${m}`)),
          error: (m: string) => console.error(m),
        },
      },
    );
    if (result.wrote) console.error(fmt.green(`  ✓ Wrote ${path.relative(root, result.wrote)}`));
    if (result.code !== 0) process.exit(result.code);
  });

trace.command('chain <id> <ac>')
  .description('Full traceability chain for a single AC')
  .option('--json', 'JSON output')
  .action(async (id: string, ac: string, opts: { json?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const features = await readFeatures(path.join(root, config.featuresDir));
    const testRefs = await scanTestFiles(config.testDirs.map(d => path.join(root, d)), root, realFs);
    const result = queryChain(id, ac, features, [], testRefs);
    if (!result) { console.error(`AC '${id}/${ac}' not found.`); process.exit(1); }
    output(`Chain: ${id}/${ac}`, renderChain(result, fmt), !!opts.json, result);
  });

const scaffold = program.command('scaffold').description('Generate test stubs for uncovered ACs');

scaffold.command('test <feature-id>')
  .description('Generate unit test stubs')
  .option('--dry-run', 'Print to stdout instead of writing')
  .action(async (featureId: string, opts: { dryRun?: boolean }) => {
    await runScaffold(featureId, 'unit', opts.dryRun ?? false);
  });

scaffold.command('e2e <feature-id>')
  .description('Generate e2e test stubs')
  .option('--dry-run', 'Print to stdout instead of writing')
  .action(async (featureId: string, opts: { dryRun?: boolean }) => {
    await runScaffold(featureId, 'e2e', opts.dryRun ?? false);
  });

program.command('compliance')
  .description('Static compliance analysis (Feature/AC declarations by test level)')
  .option('--json', 'JSON output to stdout')
  .option('--strict', 'Exit 1 if any critical AC is uncovered')
  .option('--save', 'Save a timestamped report under <reportsDir>')
  .option('--by-test', 'Reverse mapping: test file → features/ACs')
  .option('--no-orphans', 'Suppress orphan source-file section')
  .option('--no-bindings', 'Skip the bindings column and scan')
  .option('--infer', 'Write the inferred AST manifest and its changes from the previous artifact')
  .option('--date <runId>', 'Coverage run id (default: $TEST_RUN_ID)')
  .action(async (opts: {
    json?: boolean; strict?: boolean; save?: boolean; byTest?: boolean;
    orphans?: boolean; bindings?: boolean; infer?: boolean; date?: string;
  }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const includeOrphans = opts.orphans !== false;
    const includeBindings = opts.bindings !== false;

    const report = await generateReport({
      root,
      featuresDir: path.join(root, config.featuresDir),
      requirementsDir: path.join(root, config.requirementsDir),
      bindingsDir: path.join(root, config.bindingsDir),
      bindingsManifestPath: path.join(root, config.bindingsManifestPath ?? 'requirements-bindings.json'),
      testDirs: config.testDirs.map(d => path.join(root, d)),
      includeBindings,
      includeScopes: config.includeScopes,
      coverageRunId: opts.date ?? process.env.TEST_RUN_ID,
      inferredManifestPath: opts.infer ? path.join(root, config.inferredManifestPath ?? 'requirements-bindings.inferred.json') : undefined,
      inferredDiffPath: opts.infer ? path.join(root, config.inferredDiffPath ?? 'requirements-bindings.diff.json') : undefined,
    });

    if (opts.infer && report.inferredDiff) {
      const d = report.inferredDiff;
      const emptyCount = report.inferredEmptyMethods.length;
      console.error(
        `  ↳ inferred manifest: ${Object.keys(report.inferredManifest ?? {}).length} features, ` +
          `${emptyCount} @Verifies methods with no bound symbol`,
      );
      console.error(
        `  ↳ diff vs previous artifact: features only-in-previous=${d.featuresOnlyInManual.length} only-in-inferred=${d.featuresOnlyInInferred.length} ` +
          `acs only-in-manual=${d.acsOnlyInManual.length} only-in-inferred=${d.acsOnlyInInferred.length} ` +
          `symbols only-in-manual=${d.symbolsOnlyInManual.length} only-in-inferred=${d.symbolsOnlyInInferred.length}`,
      );
    }

    const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
    if (!opts.json) console.log('Static compliance analysis');

    if (opts.byTest) {
      const classToId = new Map<string, string>();
      for (const f of report.features) classToId.set(f.className, f.id);
      if (opts.json) console.log(JSON.stringify({ mode: 'static-analysis', ...buildByTestJson(report.refs, classToId) }, null, 2));
      else console.log(renderByTest(report.refs, classToId, useColor));
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify({ mode: 'static-analysis', ...buildJsonPayload(report.results, report.orphans) }, null, 2));
    } else {
      console.log(renderConsole(report.results, report.orphans, {
        useColor,
        coverageLoaded: report.coverage !== null,
        coverageRunId: report.coverageRunId,
        bindingsLoaded: report.bindingsManifest !== null,
        includeBindings,
        includeOrphans,
      }));
    }

    if (opts.save) {
      const reportsDir = path.join(root, config.reportsDir ?? 'docs/compliance');
      await fsp.mkdir(reportsDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filePath = path.join(reportsDir, `${ts}.json`);
      await fsp.writeFile(filePath, JSON.stringify({ mode: 'static-analysis', ...buildJsonPayload(report.results, report.orphans) }, null, 2), 'utf8');
      console.log(`\x1b[32m  ✓ Saved compliance report to ${path.relative(root, filePath)}\x1b[0m`);
    }

    if (opts.strict) {
      // ── Gate 0: the link gates must see the Features the report sees ──
      // An empty corpus makes every gate below pass by vacuous truth. Trust no
      // green that was computed over nothing: this is a tooling fault, not a
      // compliance verdict, hence exit 2 rather than 1.
      const corpus = await loadTraceabilityCorpus(root, config);
      if (corpus.features.length === 0 && report.results.length > 0) {
        console.error('');
        console.error('  ' + fmt.bold('Quality gate: BROKEN'));
        console.error('    ' + fmt.red(
          `✗ The report found ${report.results.length} Feature(s) but the traceability corpus is empty — ` +
          'the orphan and satisfier gates below would pass without checking anything.',
        ));
        console.error('    ' + fmt.dim(`featuresDir: ${config.featuresDir} · requirementsDir: ${config.requirementsDir}`));
        process.exit(2);
      }

      // ── Gate 1: critical uncovered ACs (legacy check) ─────────────────
      const criticalUncovered = report.results
        .filter(f => f.enabled && f.priority === 'critical')
        .some(f => f.percentage < 100);

      // ── Gate 2: orphan Features (no @Satisfies link) ──────────────────
      // REQ-DOG-FOOD / REQ-DSL-COMPLETE: every Feature must be linked to ≥ 1 Requirement.
      const specOrphans = orphanFeatureSpecs(corpus.features);

      // ── Gate 3: approved Requirements without a satisfying Feature ────
      // REQ-DSL-COMPLETE: every Approved/Implemented/Verified Requirement must be
      // satisfied by ≥ 1 Feature; otherwise the requirement is a dead promise.
      const unsatisfiedReqs = uncoveredApprovedRequirements(corpus.requirements, corpus.features);

      // ── Gate 4: version drift (pinned bindings vs current content hashes) ─
      // REQ-VERSIONED-TRACEABILITY: Features pin a specific Requirement revision
      // from requirements.config.json. Sidecar versions/hashes remain the
      // versioned corpus; malformed, duplicate or unresolved pins fail explicitly.
      const { features, requirements } = await loadAllSpecs(root, config);
      const pins = resolveConfiguredPins(config, features, requirements);
      const drifts = detectVersionDrift(
        features as readonly VersionedRequirementSpec<typeof features[number]>[],
        requirements as readonly VersionedRequirementSpec<typeof requirements[number]>[],
        pins,
      );
      const failingDrifts = drifts.filter(d => d.kind === 'req-evolved' || d.kind === 'pin-stale');
      const warningDrifts = drifts.filter(d => d.kind === 'unpinned-req');

      const failures: string[] = [];
      if (criticalUncovered) failures.push(fmt.red('✗ Critical ACs uncovered'));
      if (specOrphans.length > 0) failures.push(fmt.red(`✗ ${specOrphans.length} orphan Feature(s) (no @Satisfies): ${summarizeIds(specOrphans)}`));
      if (unsatisfiedReqs.length > 0) failures.push(fmt.red(`✗ ${unsatisfiedReqs.length} approved Requirement(s) without a satisfier: ${summarizeIds(unsatisfiedReqs)}`));
      if (failingDrifts.length > 0) failures.push(fmt.red(`✗ ${failingDrifts.length} version-drift(s) (pin vs current hash)`));
      if (warningDrifts.length > 0) console.error(fmt.yellow(`  ⚠ ${warningDrifts.length} Feature(s) satisfy an evolved Requirement without a pin`));

      if (failures.length > 0) {
        console.error('');
        console.error('  ' + fmt.bold('Quality gate: FAIL'));
        for (const f of failures) console.error('    ' + f);
        process.exit(1);
      }
    }
  });

async function runScaffold(featureId: string, level: 'unit' | 'e2e', dryRun: boolean): Promise<void> {
  const root = process.cwd();
  const config = await loadConfig(root);
  const features = await readFeatures(path.join(root, config.featuresDir));
  const feature = features.find(f => f.id === featureId);
  if (!feature) { console.error(`Feature '${featureId}' not found.`); process.exit(1); return; }

  const testRefs = await scanTestFiles(config.testDirs.map(d => path.join(root, d)), root, realFs);
  const result = buildScaffoldResult(feature, testRefs, level);

  if (result.uncovered.length === 0) { console.log(`No uncovered ${level} ACs for ${featureId}.`); return; }

  console.log(`${result.uncovered.length} uncovered ${level} AC(s) for ${featureId}:`);
  for (const ac of result.uncovered) console.log(`  - ${ac.ac}`);

  if (dryRun) { console.log(`\n--- ${result.targetPath} (dry run) ---\n`); console.log(result.generatedSource); }
  else {
    const fullPath = path.join(root, result.targetPath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, result.generatedSource, 'utf8');
    console.log(`Wrote: ${result.targetPath}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 2 — feature new/sync, requirement new/sync/list/show/orphan, schema register
// ════════════════════════════════════════════════════════════════════════════

const realRunner: CommandRunner = {
  async exec(cmd: string, opts?: { cwd?: string; env?: Record<string, string> }) {
    try {
      const { stdout, stderr } = await execPromise(cmd, { cwd: opts?.cwd, env: opts?.env });
      return { stdout: String(stdout), stderr: String(stderr), code: 0 };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; code?: number };
      return { stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? ''), code: err.code ?? 1 };
    }
  },
};

function resolveConfiguredPins(config: RequirementsConfig, features: readonly FeatureSpec[], requirements: readonly RequirementSpec[]): readonly VersionPin[] {
  const entries: unknown = config.versionPins;
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) throw new Error('versionPins must be an array of Requirement revision pins.');
  const seen = new Set<string>();
  return entries.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid version pin.');
    const pin = value as VersionPin;
      if (typeof pin.targetId !== 'string' || !Number.isSafeInteger(pin.pinnedVersion) || pin.pinnedVersion < 1 || typeof pin.pinnedHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(pin.pinnedHash) || (pin.featureId !== undefined && typeof pin.featureId !== 'string')) throw new Error('Invalid version pin fields.');
    if (!requirements.some(requirement => requirement.id === pin.targetId)) throw new Error(`Unknown version pin Requirement: ${pin.targetId}`);
    if (pin.featureId !== undefined && !features.some(feature => feature.id === pin.featureId && feature.satisfies?.includes(pin.targetId as RequirementId))) throw new Error(`Unknown version pin Feature/link: ${pin.featureId}`);
    const key = JSON.stringify([pin.featureId, pin.targetId]);
    if (seen.has(key)) throw new Error(`Duplicate version pin: ${key}`);
    seen.add(key);
    return pin;
  });
}

/** Git-backed Vcs port — `isTracked(p)` = true iff `git ls-files --error-unmatch <p>` exits 0. */
function gitVcs(runner: CommandRunner, cwd: string): Vcs {
  return {
    async isTracked(p: string) {
      const r = await runner.exec(`git ls-files --error-unmatch ${JSON.stringify(p)}`, { cwd });
      return r.code === 0;
    },
  };
}

/** Load the configured Style (dynamic import) or fall back to DefaultStyle. */
async function loadStyle(root: string, config: RequirementsConfig): Promise<RequirementStyle> {
  if (!config.style) {
    try {
      const mod = (await import('@frenchexdev2/requirements-styles')) as { DefaultStyle?: RequirementStyle };
      if (!mod.DefaultStyle) {
        console.error('@frenchexdev2/requirements-styles is installed but does not export DefaultStyle.');
        process.exit(1);
      }
      return mod.DefaultStyle;
    } catch {
      console.error(
        'No style configured and @frenchexdev2/requirements-styles is not installed. ' +
          'Install it (`npm i @frenchexdev2/requirements-styles`) or set `style:` in .requirementsrc.',
      );
      process.exit(1);
    }
  }
  const resolved = config.style.startsWith('.')
    ? path.resolve(root, config.style)
    : config.style;
  const specifier = path.isAbsolute(resolved) ? pathToFileURL(resolved).href : resolved;
  let registry: typeof import('@frenchexdev2/requirements-styles/registry') | undefined;
  try { registry = await import('@frenchexdev2/requirements-styles/registry'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  if (registry) return registry.resolveStyleFromRegistry(config.style, registry.DEFAULT_STYLE_REGISTRY, async () => import(specifier));
  const mod = (await import(specifier)) as Record<string, unknown>;
  // Convention: named export matching the module filename, or `default`, or anything ending in `Style`
  const found =
    (mod.default as RequirementStyle | undefined) ??
    (Object.values(mod).find((v): v is RequirementStyle =>
      typeof v === 'object' && v !== null && 'vocabulary' in v && 'validators' in v,
    ));
  if (!found) {
    console.error(`Module '${config.style}' does not export a RequirementStyle.`);
    process.exit(1);
  }
  return found;
}

async function readJsonSpec<T>(fullPath: string): Promise<T> {
  const raw = await fsp.readFile(fullPath, 'utf8');
  return JSON.parse(raw) as T;
}

async function listSpecsInDir(absDir: string, kind: 'feature' | 'requirement'): Promise<Spec[]> {
  let entries: string[];
  try { entries = await fsp.readdir(absDir); } catch { return []; }
  const out: Spec[] = [];
  for (const name of entries) {
    if (!name.endsWith('.spec.json')) continue;
    try {
      const spec = await readJsonSpec<Spec>(path.join(absDir, name));
      if (spec.kind === kind) out.push(spec);
    } catch { /* skip malformed */ }
  }
  return out;
}

async function loadAllSpecs(root: string, config: RequirementsConfig): Promise<{
  features: FeatureSpec[];
  requirements: RequirementSpec[];
}> {
  const features = (await listSpecsInDir(path.join(root, config.featuresDir), 'feature')) as FeatureSpec[];
  const requirements = (await listSpecsInDir(path.join(root, config.requirementsDir), 'requirement')) as RequirementSpec[];
  return { features, requirements };
}

/** Keep a failure line readable when a project has dozens of orphans. */
function summarizeIds(ids: readonly string[], max = 8): string {
  if (ids.length <= max) return ids.join(', ');
  return `${ids.slice(0, max).join(', ')} … (+${ids.length - max} more, see \`requirements requirement orphan\`)`;
}

interface TraceabilityCorpus {
  features: readonly FeatureLinkView[];
  requirements: readonly RequirementStatusView[];
  /** Where the links were read from — reported when a gate fails, so the fix lands in the right file. */
  origin: 'spec' | 'source';
}

/**
 * The corpus the `--strict` gates and `requirement orphan` read.
 *
 * A project declares its Requirement links either as sidecar `*.spec.json`
 * files or as `@Satisfies`-decorated `.ts` classes. Sidecars win when present;
 * otherwise the classes are parsed. Reading only the sidecars makes every
 * link-based gate pass vacuously on a `.ts`-only project — the corpus is empty,
 * so there is nothing to find an orphan in.
 */
async function loadTraceabilityCorpus(root: string, config: RequirementsConfig): Promise<TraceabilityCorpus> {
  const specs = await loadAllSpecs(root, config);
  if (specs.features.length > 0 || specs.requirements.length > 0) {
    return { features: specs.features, requirements: specs.requirements, origin: 'spec' };
  }

  const [featureMetas, requirementMetas] = await Promise.all([
    readFeatures(path.join(root, config.featuresDir)).catch(() => []),
    readRequirements(path.join(root, config.requirementsDir)),
  ]);
  return { ...deriveTraceabilityCorpus(featureMetas, requirementMetas), origin: 'source' };
}

async function runSpecWizardFlow(
  spec: Spec,
  root: string,
  config: RequirementsConfig,
  opts: { yes?: boolean; noTest?: boolean; dryRun?: boolean },
): Promise<void> {
  await orchestrateSpecWizard(
    spec,
    root,
    {
      featuresDir: config.featuresDir,
      requirementsDir: config.requirementsDir,
      testDirsByLevel: config.testDirsByLevel,
    },
    {
      prompt: realPrompt(),
      fs: realFs,
      logger: {
        info: (m: string) => console.log(m),
        warn: (m: string) => console.warn(m),
        error: (m: string) => console.error(m),
      },
      openInEditor: (paths: readonly string[]) => openInEditor(paths, realRunner),
      vcs: gitVcs(realRunner, root),
    },
    opts,
  );
}

// ── `ast-smells` ───────────────────────────────────────────────────────────

program.command('ast-smells')
  .description('AST-level honest detection of test smells (empty-targets, empty-body, no-assertion). NOT mutation testing — that lives behind `behavioral-check`.')
  .option('--json', 'JSON output to stdout')
  .option('--report <path>', 'Save JSON report to file')
  .option('--strict', 'Exit 1 if any smell is found')
  .action(async (opts: { json?: boolean; report?: string; strict?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const r = await scanTestSmells({
      testDirs: config.testDirs.map(d => path.join(root, d)),
      root,
      fs: realFs,
    });

    if (opts.json) {
      console.log(JSON.stringify({ smells: r.smells, fileCount: r.fileCount, warnings: r.warnings }, null, 2));
    } else if (r.smells.length === 0) {
      console.log(`\x1b[32m  ✓ No smells detected across ${r.fileCount} test file(s).\x1b[0m`);
    } else {
      const byKind = new Map<string, TestSmell[]>();
      for (const s of r.smells) {
        const list = byKind.get(s.kind) ?? [];
        list.push(s);
        byKind.set(s.kind, list);
      }
      console.log(`\x1b[33m  ${r.smells.length} smell(s) across ${r.fileCount} test file(s):\x1b[0m`);
      for (const [kind, list] of [...byKind.entries()].sort()) {
        console.log(`\n  ── ${kind} (${list.length}) ──`);
        for (const s of list) {
          const rel = path.relative(root, s.file);
          console.log(`    ${s.featureClass}.${s.ac}  ${rel}::${s.className}.${s.methodName}`);
        }
      }
    }
    for (const w of r.warnings) console.error('\x1b[33m  ⚠  ' + w + '\x1b[0m');

    if (opts.report) {
      const reportPath = path.isAbsolute(opts.report) ? opts.report : path.join(root, opts.report);
      await fsp.writeFile(reportPath, JSON.stringify({ smells: r.smells, fileCount: r.fileCount, warnings: r.warnings }, null, 2), 'utf8');
      console.log(`\x1b[32m  ✓ Saved smells report to ${path.relative(root, reportPath)}\x1b[0m`);
    }

    if (opts.strict && r.smells.length > 0) {
      console.error(`\x1b[31m  ✗ ast-smells --strict: ${r.smells.length} smell(s) detected\x1b[0m`);
      process.exit(1);
    }
  });

// ── `behavioral-check` ─────────────────────────────────────────────────────

program.command('behavioral-check')
  .description('Mutation-testing — scoped per Feature.AC with --feature/--ac (~5-10 min), or global across all tests when both are omitted (~20-40 min). Dev opt-in, NEVER in `--strict` / CI.')
  .option('--feature <featureId>', 'Target Feature id (e.g. TEST-BINDINGS-SCANNER). Omit together with --ac to audit every AC.')
  .option('--ac <acName>', 'Target AC name (camelCase, the method name on the Feature class). Omit together with --feature to audit every AC.')
  .option('--plan-only', 'Print the derived plan + Stryker config, do not invoke Stryker (scoped mode only)')
  .option('--concurrency <n>', 'Stryker worker concurrency for the global audit fallback', '4')
  .option('--threshold <percent>', 'Mutation-score threshold (0-100) for the global audit verdict', '0')
  .option('--strict-types', 'Enable @stryker-mutator/typescript-checker: kill mutants that violate the type system before running tests')
  .option('--report <path>', 'Save JSON audit to file (global audit fallback only)')
  .option('--json', 'JSON output to stdout (suppresses the human-readable rendering)')
  .action(async (opts: { feature?: string; ac?: string; planOnly?: boolean; concurrency: string; threshold: string; strictTypes?: boolean; report?: string; json?: boolean }) => {
    const root = process.cwd();

    // No --feature / --ac → fall through to the global audit (every src × every test).
    if (!opts.feature && !opts.ac) {
      await runBehavioralAudit(root, {
        concurrency: parseInt(opts.concurrency, 10),
        thresholdPercent: parseFloat(opts.threshold),
        strictTypes: opts.strictTypes,
        json: opts.json,
        report: opts.report,
      });
      return;
    }
    if (!opts.feature || !opts.ac) {
      console.error('\x1b[31m  ✗ --feature and --ac must be given together. Omit both for a global audit.\x1b[0m');
      process.exit(1);
    }
    const featureId = opts.feature;
    const acName = opts.ac;

    const config = await loadConfig(root);
    const repoRoot = path.resolve(root, '..', '..');

    // Gather parse-results across every configured test directory.
    const testFiles: string[] = [];
    for (const dir of config.testDirs) {
      const abs = path.isAbsolute(dir) ? dir : path.join(root, dir);
      testFiles.push(...(await collectTestFiles(realFs, abs)));
    }
    const fileExists = await buildFileExistsPredicate(realFs, root, ['src/', 'scripts/']);
    const parsed: TestParseResult[] = [];
    for (const file of testFiles) {
      try {
        const src = await realFs.readFile(file, 'utf8');
        parsed.push(parseTestFile(src, file, root, undefined, fileExists));
      } catch { /* skip unreadable */ }
    }

    // Build classToId from on-disk Features.
    const featureSpecs = await readFeatures(path.join(root, config.featuresDir));
    const classToId = new Map<string, string>();
    for (const f of featureSpecs) classToId.set(f.className, f.id);

    const plan = planBehavioralCheck(parsed, featureId, acName, classToId);
    const stryker = plan.vacuous ? null : buildStrykerConfig(plan, { repoRoot, strictTypes: opts.strictTypes });

    if (opts.json) {
      console.log(JSON.stringify({ plan, stryker }, null, 2));
      if (plan.vacuous) process.exit(2);
      if (opts.planOnly) return;
      // Stryker invocation (Livraison 2 step 2) — not yet wired.
      console.error('  ⚠  Stryker invocation not yet implemented. Use --plan-only for now.');
      process.exit(3);
    }

    // Human-readable rendering.
    console.log(`\x1b[1m  Behavioural check\x1b[0m  ${featureId}.${acName}`);
    if (plan.vacuous) {
      console.log(`\x1b[33m  ✗ vacuous — ${plan.reason}\x1b[0m`);
      if (plan.testFiles.length > 0) {
        console.log(`    test files matching the AC: ${plan.testFiles.length}`);
        for (const f of plan.testFiles) console.log(`      - ${path.relative(root, f) || f}`);
      }
      process.exit(2);
    }
    console.log(`\x1b[32m  ✓ plan ready\x1b[0m`);
    console.log(`    mutate files (${plan.mutateFiles.length}):`);
    for (const f of plan.mutateFiles) console.log(`      ${f}`);
    console.log(`    test files (${plan.testFiles.length}):`);
    for (const f of plan.testFiles) console.log(`      ${path.relative(root, f) || f}`);

    if (opts.planOnly) {
      console.log(`\n  Stryker config preview (would write to .stryker-tmp-behavioral.conf.json):`);
      console.log(JSON.stringify(stryker, null, 2));
      console.log(`\n  Run without --plan-only to invoke Stryker (expected ~5-10 min).`);
      return;
    }

    // ── Step 2: actually run Stryker ──────────────────────────────────────
    console.log(`\n\x1b[2m  ── Stryker run (this may take 5-10 min) ──\x1b[0m`);
    const result = await runStrykerForPlan({ packageRoot: root, repoRoot, config: stryker! });
    const verdict = classifyVerdict(plan, result.mutationScorePercent);

    const verdictColor =
      verdict === 'pass' ? '\x1b[32m' :
      verdict === 'warn' ? '\x1b[33m' :
      verdict === 'fail' ? '\x1b[31m' :
      '\x1b[33m';
    console.log(`\n${verdictColor}  Verdict: ${verdict.toUpperCase()}\x1b[0m`);
    console.log(`    mutation score: ${result.mutationScorePercent.toFixed(2)}% (${result.killed}/${result.killed + result.survived + result.timeout} killed)`);
    console.log(`    killed=${result.killed} survived=${result.survived} timeout=${result.timeout}`);
    if (result.noCoverage > 0 || result.runtimeErrors > 0 || result.compileErrors > 0) {
      console.log(`    no-coverage=${result.noCoverage} runtime-err=${result.runtimeErrors} compile-err=${result.compileErrors}`);
    }
    console.log(`    report: ${path.relative(root, result.reportFile)}`);

    if (verdict === 'fail') process.exit(4);
  });

// ── `behavioral-audit` ─────────────────────────────────────────────────────

interface BehavioralAuditOpts {
  readonly concurrency: number;
  readonly thresholdPercent: number;
  readonly strictTypes?: boolean;
  readonly json?: boolean;
  readonly report?: string;
}

async function runBehavioralAudit(root: string, opts: BehavioralAuditOpts): Promise<void> {
  const config = await loadConfig(root);
  const repoRoot = path.resolve(root, '..', '..');

  // 1. Scan every test file across the configured testDirs.
  const testFiles: string[] = [];
  for (const dir of config.testDirs) {
    const abs = path.isAbsolute(dir) ? dir : path.join(root, dir);
    testFiles.push(...(await collectTestFiles(realFs, abs)));
  }
  const fileExists = await buildFileExistsPredicate(realFs, root, ['src/', 'scripts/']);
  const parsed: TestParseResult[] = [];
  for (const file of testFiles) {
    try { parsed.push(parseTestFile(await realFs.readFile(file, 'utf8'), file, root, undefined, fileExists)); }
    catch { /* skip unreadable */ }
  }

  // 2. classToId from on-disk Features.
  const featureSpecs = await readFeatures(path.join(root, config.featuresDir));
  const classToId = new Map<string, string>();
  for (const f of featureSpecs) classToId.set(f.className, f.id);

  // 3. Global plan: every src/ file any AC touches, every test file.
  const mutateFiles = new Set<string>();
  const usedTestFiles = new Set<string>();
  for (const p of parsed) {
    let touched = false;
    for (const cls of p.classes) {
      for (const m of cls.methods) {
        for (const t of m.targets) {
          if (t.file.startsWith('src/')) { mutateFiles.add(t.file); touched = true; }
        }
      }
    }
    if (touched) usedTestFiles.add(p.file);
  }
  if (mutateFiles.size === 0) {
    console.error('\x1b[33m  ⚠  no src/ targets discovered — nothing to mutate.\x1b[0m');
    process.exit(2);
  }

  const globalPlan: BehavioralCheckPlan = {
    featureId: 'AUDIT',
    acName: 'all',
    mutateFiles: [...mutateFiles].sort(),
    testFiles: [...usedTestFiles].sort(),
    vacuous: false,
  };
  const stryker = buildStrykerConfig(globalPlan, {
    repoRoot,
    concurrency: opts.concurrency,
    tempDirName: '.stryker-tmp-audit',
    strictTypes: opts.strictTypes,
  });

  const modeNote = opts.strictTypes ? ', strict-types ON' : '';
  console.log(`\x1b[1m  Behavioural audit\x1b[0m  (${globalPlan.mutateFiles.length} src files × ${globalPlan.testFiles.length} test files, concurrency=${opts.concurrency}${modeNote})`);
  console.log(`\x1b[2m  ── Stryker run (this may take 20-40 min) ──\x1b[0m`);
  const run = await runStrykerForPlan({ packageRoot: root, repoRoot, config: stryker });
  const report = JSON.parse(await fsp.readFile(run.reportFile, 'utf8')) as MutationReport;
  const audit = aggregateByAc(report, parsed, classToId, { thresholdPercent: opts.thresholdPercent });

  if (opts.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(`\n  Global mutation score: ${audit.globalMutationScorePercent.toFixed(2)}% (killed ${audit.globalKilled} / ${audit.globalTotal}, survived ${audit.globalSurvived}, timeout ${audit.globalTimeout})`);
    const byVerdict = new Map<string, BehavioralAuditEntry[]>();
    for (const e of audit.entries) {
      const list = byVerdict.get(e.verdict) ?? [];
      list.push(e);
      byVerdict.set(e.verdict, list);
    }
    for (const v of ['fail', 'warn', 'vacuous', 'pass']) {
      const list = byVerdict.get(v);
      if (!list || list.length === 0) continue;
      const colour = v === 'pass' ? '\x1b[32m' : v === 'fail' ? '\x1b[31m' : '\x1b[33m';
      console.log(`\n  ${colour}── ${v.toUpperCase()} (${list.length}) ──\x1b[0m`);
      for (const e of list) {
        console.log(`    ${e.acId.padEnd(50)}  ${e.mutationScorePercent.toFixed(1).padStart(6)}%  (killed ${e.killed}/${e.relevantTotal})`);
      }
    }
  }

  if (opts.report) {
    const reportPath = path.isAbsolute(opts.report) ? opts.report : path.join(root, opts.report);
    await fsp.writeFile(reportPath, JSON.stringify(audit, null, 2), 'utf8');
    console.log(`\n\x1b[32m  ✓ Saved audit to ${path.relative(root, reportPath)}\x1b[0m`);
  }

  const failed = audit.entries.filter(e => e.verdict === 'fail').length;
  if (failed > 0) process.exit(4);
}

program.command('behavioral-audit')
  .description('Global mutation-testing audit — mutates all src/ files in this package, runs every test once, aggregates per-AC scores. Dev opt-in, ~20-40 min.')
  .option('--concurrency <n>', 'Stryker worker concurrency (defaults to 4 — bump for faster runs on multi-core)', '4')
  .option('--threshold <percent>', 'Mutation-score threshold (0-100) for the per-AC verdict', '0')
  .option('--strict-types', 'Enable @stryker-mutator/typescript-checker: kill mutants that violate the type system before running tests (slower per-mutant, kills more)')
  .option('--json', 'JSON output to stdout')
  .option('--report <path>', 'Save JSON audit to file')
  .action(async (opts: { concurrency: string; threshold: string; strictTypes?: boolean; json?: boolean; report?: string }) => {
    await runBehavioralAudit(process.cwd(), {
      concurrency: parseInt(opts.concurrency, 10),
      thresholdPercent: parseFloat(opts.threshold),
      strictTypes: opts.strictTypes,
      json: opts.json,
      report: opts.report,
    });
  });

// ── `feature new` ──────────────────────────────────────────────────────────

const feature = program.command('feature').description('Feature bootstrap + sync');

feature.command('new')
  .description('Interactive wizard: create a new Feature class + spec.json + test scaffold')
  .option('--replay <spec>', 'Replay an existing spec.json with interactive defaults')
  .option('--yes', 'Non-interactive: accept defaults / existing spec as-is')
  .option('--dry-run', 'Render diffs without writing')
  .option('--no-test', 'Skip test-stub scaffolding')
  .option('--template <id>', 'Start from a Style template')
  .action(async (opts: { replay?: string; yes?: boolean; dryRun?: boolean; noTest?: boolean; template?: string }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const style = await loadStyle(root, config);
    const { features, requirements } = await loadAllSpecs(root, config);

    const seed = opts.replay
      ? await readJsonSpec<FeatureSpec>(path.resolve(root, opts.replay))
      : undefined;

    const spec = await runFeatureWizard(
      {
        prompt: realPrompt(),
        style,
        existingFeatureIds: features.map(f => f.id) as readonly FeatureId[],
        existingRequirementIds: requirements.map(r => r.id) as readonly RequirementId[],
      },
      seed,
      { yes: opts.yes, noTest: opts.noTest, template: opts.template },
    );

    await runSpecWizardFlow(spec, root, config, { yes: opts.yes, noTest: opts.noTest, dryRun: opts.dryRun });
  });

feature.command('sync <spec>')
  .description('Reconcile an existing spec.json with its derived files on disk')
  .option('--yes', 'Apply all changes silently')
  .option('--dry-run', 'Render diffs without writing')
  .option('--no-test', 'Do not regenerate test scaffolds')
  .action(async (specPath: string, opts: { yes?: boolean; dryRun?: boolean; noTest?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const spec = await readJsonSpec<Spec>(path.resolve(root, specPath));
    if (spec.$schemaVersion !== SCHEMA_VERSION) {
      console.error(`Spec $schemaVersion '${spec.$schemaVersion}' ≠ package '${SCHEMA_VERSION}'. Migrate first.`);
      process.exit(1);
    }
    await runSpecWizardFlow(spec, root, config, opts);
  });

// ── `feature rename <old> <new>` ────────────────────────────────────────────

feature.command('rename <oldId> <newId>')
  .description('Rename a Feature id across class, file, spec.json, and every @FeatureTest / @Verifies site')
  .option('--apply', 'Write changes (default: dry-run)')
  .option('--force', 'Override conflict + typecheck guards')
  .action(async (oldId: string, newId: string, opts: { apply?: boolean; force?: boolean }) => {
    await runRenameCli('feature', oldId, newId, undefined, opts);
  });

// ── `requirement new/sync/list/show/orphan/rename` ─────────────────────────

const requirement = program.command('requirement').description('Requirement bootstrap + queries (WHY tier)');

requirement.command('new')
  .description('Interactive wizard: create a new Requirement class + spec.json')
  .option('--replay <spec>', 'Replay an existing requirement.spec.json')
  .option('--from-feature <featureId>', 'Seed from an existing Feature')
  .option('--yes', 'Non-interactive: accept defaults')
  .option('--dry-run', 'Render diffs without writing')
  .option('--template <id>', 'Start from a Style template')
  .action(async (opts: { replay?: string; fromFeature?: string; yes?: boolean; dryRun?: boolean; template?: string }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const style = await loadStyle(root, config);
    const { features, requirements } = await loadAllSpecs(root, config);

    let seed: RequirementSpec | undefined;
    if (opts.replay) seed = await readJsonSpec<RequirementSpec>(path.resolve(root, opts.replay));

    let fromFeature: FeatureSpec | undefined;
    if (opts.fromFeature) {
      fromFeature = features.find(f => f.id === opts.fromFeature);
      if (!fromFeature) { console.error(`Feature '${opts.fromFeature}' not found.`); process.exit(1); }
    }

    const spec = await runRequirementWizard(
      {
        prompt: realPrompt(),
        style,
        existingFeatureIds: features.map(f => f.id) as readonly FeatureId[],
        existingRequirementIds: requirements.map(r => r.id) as readonly RequirementId[],
      },
      seed,
      { yes: opts.yes, template: opts.template, fromFeature },
    );

    await runSpecWizardFlow(spec, root, config, { yes: opts.yes, dryRun: opts.dryRun, noTest: true });
  });

requirement.command('sync <spec>')
  .description('Reconcile a requirement.spec.json with its .ts class on disk')
  .option('--yes', 'Apply all changes silently')
  .option('--dry-run', 'Render diffs without writing')
  .action(async (specPath: string, opts: { yes?: boolean; dryRun?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const spec = await readJsonSpec<Spec>(path.resolve(root, specPath));
    if (spec.kind !== 'requirement') { console.error(`Not a requirement spec: kind='${spec.kind}'`); process.exit(1); }
    await runSpecWizardFlow(spec, root, config, { ...opts, noTest: true });
  });

requirement.command('list')
  .description('List all Requirements with per-Requirement coverage')
  .option('--json', 'JSON output')
  .action(async (opts: { json?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const { features, requirements } = await loadAllSpecs(root, config);
    const satisfiedBy = buildSatisfiedByIndex();
    const rows = requirements.map(r => {
      const satisfiers = features.filter(f => (f.satisfies ?? []).includes(r.id));
      const totalAcs = satisfiers.reduce((acc, f) => acc + f.acs.length, 0);
      return {
        id: r.id,
        title: r.title,
        kind: r.requirementKind,
        status: r.status,
        priority: r.priority,
        satisfiedBy: satisfiers.map(f => f.id),
        satisfiedByRuntime: satisfiedBy.get(r.id) ?? [],
        totalAcs,
      };
    });
    if (opts.json) { console.log(JSON.stringify(rows, null, 2)); return; }
    console.log('\n  ' + fmt.bold('Requirements'));
    for (const r of rows) {
      const tag = r.satisfiedBy.length === 0 ? fmt.red('✗ no satisfier') : fmt.green(`✓ ${r.satisfiedBy.length} feat`);
      console.log(`    ${r.id.padEnd(28)} ${r.status.padEnd(14)} ${tag}  ${fmt.dim(r.title)}`);
    }
    console.log('');
  });

requirement.command('show <reqId>')
  .description('Full 4-tier trace chain: REQ → FEAT → AC → TEST')
  .option('--json', 'JSON output')
  .action(async (reqId: string, opts: { json?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const { features, requirements } = await loadAllSpecs(root, config);
    const req = requirements.find(r => r.id === reqId);
    if (!req) { console.error(`Requirement '${reqId}' not found.`); process.exit(1); return; }
    const chain = traceChainFor(req.id, features);
    if (opts.json) { console.log(JSON.stringify({ requirement: req, chain }, null, 2)); return; }
    const style = await loadStyle(root, config);
    console.log('\n' + style.reporter.renderRequirement(req));
    console.log('\n  ' + fmt.bold('Satisfied by:'));
    if (chain.features.length === 0) console.log('    ' + fmt.red('(no Feature satisfies this Requirement)'));
    for (const fid of chain.features) {
      const f = features.find(x => x.id === fid);
      console.log(`    ${fid}${f ? ' — ' + fmt.dim(f.title) : ''}`);
    }
    console.log('\n  ' + fmt.bold('Specified by (ACs):'));
    for (const { feature: fid, ac } of chain.acs) console.log(`    ${fid}.${ac}`);
    console.log('\n  ' + fmt.bold('Verified by (tests):'));
    if (chain.tests.length === 0) console.log('    ' + fmt.yellow('(no tests registered)'));
    for (const t of chain.tests) console.log(`    ${t.testClass}.${t.testMethod}  → ${t.feature}.${t.ac}`);
    console.log('');
  });

requirement.command('orphan')
  .description('List Features with no @Satisfies link (decorated class or spec sidecar)')
  .option('--json', 'JSON output')
  .action(async (opts: { json?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const { features, origin } = await loadTraceabilityCorpus(root, config);
    const specOrphans = orphanFeatureSpecs(features);
    const runtimeOrphans = findOrphanFeatures(features.map(f => f.id));
    if (opts.json) {
      console.log(JSON.stringify({ origin, scanned: features.length, specOrphans, runtimeOrphans }, null, 2));
      return;
    }
    console.log('\n  ' + fmt.bold('Orphan Features') +
      fmt.dim(` — ${features.length} scanned from ${origin === 'spec' ? '*.spec.json' : `${config.featuresDir}/*.ts`}`));
    if (features.length === 0) {
      console.log('    ' + fmt.yellow('! No Feature found — nothing was checked.'));
    } else if (specOrphans.length === 0 && runtimeOrphans.length === 0) {
      console.log('    ' + fmt.green('✓ Every Feature is linked to ≥ 1 Requirement.'));
    }
    for (const id of specOrphans) console.log(`    ${fmt.red('✗')} ${id} (no Requirement link)`);
    for (const id of runtimeOrphans) console.log(`    ${fmt.yellow('!')} ${id} (no runtime @Satisfies link)`);
    console.log('');
  });

requirement.command('rename <oldId> <newId>')
  .description('Rename a Requirement id across class, file, spec.json, and every @Satisfies arg')
  .option('--apply', 'Write changes (default: dry-run)')
  .option('--force', 'Override conflict + typecheck guards')
  .action(async (oldId: string, newId: string, opts: { apply?: boolean; force?: boolean }) => {
    await runRenameCli('requirement', oldId, newId, undefined, opts);
  });

async function runRenameCli(
  kind: 'feature' | 'requirement',
  oldId: string,
  newId: string,
  _owner: string | undefined,
  opts: { apply?: boolean; force?: boolean },
): Promise<void> {
  const root = process.cwd();
  const config = await loadConfig(root);
  const ctx = {
    root,
    scanDirs: config.testDirs.map(d => path.resolve(root, d)),
    featuresDir: path.resolve(root, config.featuresDir),
    requirementsDir: path.resolve(root, config.requirementsDir),
    apply: !!opts.apply,
    force: !!opts.force,
  };
  try {
    const res = kind === 'feature'
      ? await runRenameFeature(oldId, newId, ctx, realFs)
      : await runRenameRequirement(oldId, newId, ctx, realFs);
    process.stdout.write(res.plan.unifiedDiff);
    console.log('');
    console.log(res.message);
  } catch (e) {
    if (e instanceof RenameError) {
      console.error(fmt.red(`✗ rename refused (${e.code}): ${e.message}`));
      process.exit(1);
    }
    throw e;
  }
}

// ── `schema register` ──────────────────────────────────────────────────────

const schema = program.command('schema').description('JSON Schema emission + editor binding');

schema.command('register')
  .description('Merge the package schemas into .vscode/settings.json for autocomplete/validation')
  .option('--print', 'Print the snippet only; do not touch any file')
  .option('--force', 'Overwrite conflicting json.schemas entries')
  .action(async (opts: { print?: boolean; force?: boolean }) => {
    const root = process.cwd();
    const result = await registerSchema({ projectRoot: root, fs: realFs, print: opts.print, force: opts.force });
    if (opts.print || result.mode === 'printed') {
      console.log(result.snippet);
      return;
    }
    if (result.mode === 'conflict') {
      console.error(fmt.red(`Conflicting entry in ${path.relative(root, result.settingsPath)}:`));
      console.error(JSON.stringify(result.conflictingEntry, null, 2));
      console.error(fmt.yellow('Re-run with --force to overwrite, or copy the snippet below into your settings:'));
      console.error(result.snippet);
      process.exit(1);
      return;
    }
    const verb = result.mode === 'created' ? 'Created' : 'Merged into';
    console.log(fmt.green(`  ✓ ${verb} ${path.relative(root, result.settingsPath)}`));
  });

// ── `explore` — interactive TUI ───────────────────────────────────────────

program.command('explore')
  .description('Interactive TTY browser over REQ → FEAT → AC → TEST')
  .action(async () => {
    const { runExploreCli } = await import('../cli/explore-shell.js');
    const root = process.cwd();
    const config = await loadConfig(root);
    await runExploreCli(
      {
        featuresDir: path.join(root, config.featuresDir),
        requirementsDir: path.join(root, config.requirementsDir),
      },
      {
        fs: realFs,
        stdout: {
          write: (s: string) => process.stdout.write(s),
          isTTY: Boolean(process.stdout.isTTY),
        },
        stderr: { write: (s: string) => process.stderr.write(s) },
        exit: (code: number) => process.exit(code),
      },
    );
  });

// ── `watch` — live revalidation + compliance delta ─────────────────────────

program.command('watch')
  .description('Live mode: re-validate specs + print compliance delta on every save (Ctrl-C to exit)')
  .option('--debounce <ms>', 'Debounce window in ms (default 150)', (v: string) => parseInt(v, 10), 150)
  .action(async (opts: { debounce?: number }) => {
    const root = process.cwd();
    const config = await loadConfig(root);
    const paths = [
      path.join(root, config.featuresDir),
      path.join(root, config.requirementsDir),
    ];

    const nodeWatcher: FileWatcher = {
      watch(targets, onChange) {
        const watchers = targets.map((p) =>
          fsWatch(p, { recursive: true }, (_evt: string, filename: string | null) => {
            if (!filename) return;
            onChange(path.join(p, filename.toString()));
          }),
        );
        return () => { for (const w of watchers) w.close(); };
      },
    };

    const scheduler = {
      setTimeout: (fn: () => void, ms: number) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      setInterval: (fn: () => void, ms: number) => {
        const t = setInterval(fn, ms);
        return () => clearInterval(t);
      },
    };
    const clock = { now: () => Date.now() };
    const logger = {
      info: (m: string) => console.log(m),
      warn: (m: string) => console.warn(m),
      error: (m: string) => console.error(m),
    };

    const handle = startWatch({
      paths, fs: realFs, watcher: nodeWatcher, scheduler, clock, logger,
      debounceMs: opts.debounce,
      validator: validateSpec,
      compliance: { orphanFeatureSpecs, uncoveredApprovedRequirements },
    });
    console.log(fmt.dim(`[watch] watching ${paths.join(', ')} — Ctrl-C to exit`));
    process.on('SIGINT', () => {
      handle.cancel();
      console.log('\n' + fmt.dim('[watch] stopped'));
      process.exit(0);
    });
  });

// ── Extend `compliance --strict` with orphan-Feature gate ──────────────────

// Scenario subcommands moved to @frenchexdev2/requirements-styles-demo (`rsd` bin) during Ship 4.

return program;
}

/** Await command completion and preserve every native argument except the documented pnpm separator. */
export async function main(argv: readonly string[] = process.argv): Promise<void> {
  const args = argv[2] === '--' ? [...argv.slice(0, 2), ...argv.slice(3)] : [...argv];
  await createRequirementsProgram().parseAsync(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
