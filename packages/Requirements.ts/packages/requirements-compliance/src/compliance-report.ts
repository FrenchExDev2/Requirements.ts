import * as path from 'path';
import {
  readFeatures,
  readRequirements,
  findLatestCoverageSummary,
  loadCoverageSummary,
  computeRuntimeCoverage,
  findOrphanSourceFiles,
  type FeatureMeta,
  type FileCov,
  type RuntimeCoverage,
  type OrphanFile,
  type TestLevel,
} from './compliance-core.js';
import {
  scanTestBindings,
  diffManifests,
  sortManifest,
  type BindingsManifest,
  type SymbolTarget,
  type ManifestDiff,
  type EmptyMethodRef,
} from '@frenchexdev2/requirements-scanner';
import type { ReadableFileSystem } from '@frenchexdev2/requirements-core/ports';
// Minimal table types inlined (avoids coupling to site-specific TUI widget).
// Rows are pre-computed string[][] (one cell per column). ANSI escapes in cells
// are stripped when measuring width so colored output still aligns visually.
export interface TableColumn {
  header: string;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'right';
}
interface TableOpts {
  indent: number;
  headerColor: (s: string) => string;
  separatorColor: (s: string) => string;
}
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const visibleLen = (s: string): number => s.replace(ANSI_RE, '').length;
const padCell = (s: string, width: number, align: 'left' | 'right'): string => {
  const pad = ' '.repeat(Math.max(0, width - visibleLen(s)));
  return align === 'right' ? pad + s : s + pad;
};
function table(cols: TableColumn[], rows: string[][], opts: TableOpts): string[] {
  const widths = cols.map((c, i) => {
    const cellWidths = rows.map(r => visibleLen(r[i]!));
    return Math.max(c.minWidth ?? 0, c.width ?? 0, c.header.length, ...cellWidths);
  });
  const indent = ' '.repeat(opts.indent);
  const headerLine = indent + '| ' + cols.map((c, i) => opts.headerColor(padCell(c.header, widths[i]!, c.align ?? 'left'))).join(' | ') + ' |';
  const sepLine = indent + opts.separatorColor('+-' + widths.map(w => '-'.repeat(w)).join('-+-') + '-+');
  const body = rows.map(r => indent + '| ' + cols.map((c, i) => padCell(r[i]!, widths[i]!, c.align ?? 'left')).join(' | ') + ' |');
  return [headerLine, sepLine, ...body];
}
import { promises as fsp } from 'fs';

export type { TestLevel } from './compliance-core.js';

export interface TestRef {
  feature: string;
  featureId: string;
  ac: string;
  testFile: string;
  testName: string;
  level: TestLevel;
}

export interface ACCoverage {
  method: string;
  tests: { file: string; name: string; level: TestLevel }[];
  covered: boolean;
  /** Expected test levels (from @Expects decorator, default ['unit']). */
  expectedLevels: readonly TestLevel[];
  /** Which expected levels have at least one matching test. */
  coveredLevels: readonly TestLevel[];
  /** Expected levels with no matching test — these are gaps. */
  gapLevels: readonly TestLevel[];
}

export type BindingsStatus = 'bound' | 'partial' | 'unbound' | 'disabled';

export interface FeatureBindingsSummary {
  status: BindingsStatus;
  totalAcs: number;
  boundAcs: number;
  symbols: Array<{ ac: string } & SymbolTarget>;
}

export interface FeatureCoverage {
  id: string;
  title: string;
  priority: string;
  enabled: boolean;
  sourceFiles: readonly string[];
  acs: ACCoverage[];
  coveredCount: number;
  totalCount: number;
  percentage: number;
  runtimeCoverage: RuntimeCoverage;
  bindings: FeatureBindingsSummary;
  /** @Satisfies(ClassName) → REQ-IDs when resolvable, else raw class names. */
  satisfies: readonly string[];
}

/**
 * Returns true if the given source contains a bare `describe(` or `it(` call
 * outside comments and string literals. Pure function extracted from the
 * `noFunctionalTests` compliance test so REQ-TRACK has a real binding target
 * (the existing test file owns the enforcement; this helper owns the logic).
 */
export function hasBareDescribeOrIt(src: string): boolean {
  const stripped = src
    .replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, '""')
    .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
    .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '""');
  return /\bdescribe\s*\(/.test(stripped) || /\bit\s*\(/.test(stripped);
}

export interface MachineLink {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly features?: readonly { readonly id: string; readonly ac: string }[];
}

export interface FsmFeatureLinkReport {
  readonly unlinked: string[];
  readonly unknownFeat: string[];
  readonly unknownAc: string[];
}

/**
 * Pure fn: given a list of @FiniteStateMachine-decorated machines and an
 * index of { featureId → Set<acName> }, return the three violation buckets
 * used by the `everyFsmLinkedToFeature` AC. Extracted from the compliance
 * test so the logic is reusable and unit-testable without touching disk.
 */
export function validateFsmFeatureLinks(
  machines: readonly MachineLink[],
  featureAcs: ReadonlyMap<string, ReadonlySet<string>>,
): FsmFeatureLinkReport {
  const unlinked: string[] = [];
  const unknownFeat: string[] = [];
  const unknownAc: string[] = [];
  for (const m of machines) {
    if (!m.features || m.features.length === 0) {
      unlinked.push(`${m.name}  (${m.file})`);
      continue;
    }
    for (const fl of m.features) {
      const known = featureAcs.get(fl.id);
      if (!known) {
        unknownFeat.push(`${m.name} → feature id '${fl.id}' not found in requirements/features/`);
        continue;
      }
      if (!known.has(fl.ac)) {
        unknownAc.push(`${m.name} → ${fl.id}/${fl.ac}  (AC not declared on Feature class)`);
      }
    }
  }
  return { unlinked, unknownFeat, unknownAc };
}

export async function scanTestFiles(
  testDirs: readonly string[],
  root: string,
  fsPort: ReadableFileSystem,
): Promise<TestRef[]> {
  const refs: TestRef[] = [];
  for (const dir of testDirs) {
    if (!(await fsPort.exists(dir))) continue;
    await scanDir(dir, refs, root, fsPort);
  }
  return refs;
}

function inferTestLevel(relPath: string): TestLevel {
  if (relPath.startsWith('test/e2e/'))     return 'e2e';
  if (relPath.startsWith('test/a11y/'))    return 'a11y';
  if (relPath.startsWith('test/visual/'))  return 'visual';
  if (relPath.startsWith('test/perf/'))    return 'perf';
  if (relPath.startsWith('test/smoke/'))   return 'smoke';
  return 'unit';
}

async function scanDir(dir: string, refs: TestRef[], root: string, fsPort: ReadableFileSystem): Promise<void> {
  for (const entry of await fsPort.readdir(dir)) {
    const full = path.join(dir, entry);
    if ((await fsPort.stat(full)).isDirectory()) {
      await scanDir(full, refs, root, fsPort);
      continue;
    }
    if (!entry.endsWith('.ts') && !entry.endsWith('.js')) continue;

    const src = await fsPort.readFile(full, 'utf8');
    const relPath = path.relative(root, full).replace(/\\/g, '/');
    const level = inferTestLevel(relPath);

    const verifiesRegex = /@Verifies<(\w+)>\s*\(\s*'(\w+)'\s*\)/g;
    let m;
    while ((m = verifiesRegex.exec(src)) !== null) {
      const after = src.slice(m.index + m[0].length, m.index + m[0].length + 200);
      const nameMatch = after.match(/(?:async\s+)?['"]?([^'"({]+)['"]?\s*[({]/);
      refs.push({
        feature: m[1]!,
        featureId: '',
        ac: m[2]!,
        testFile: relPath,
        testName: nameMatch?.[1]?.trim() ?? '(unnamed)',
        level,
      });
    }

    const featureTestClassRegex = /@FeatureTest\((\w+)\)\s*\n\s*(?:export\s+)?class\s+(\w+)/g;
    let ft;
    while ((ft = featureTestClassRegex.exec(src)) !== null) {
      const featureName = ft[1]!;
      const className = ft[2]!;
      const coversRegex = new RegExp(`class\\s+${className}[\\s\\S]*?static\\s+readonly\\s+coversACs[^=]*=\\s*\\[([^\\]]+)\\]`);
      const coversMatch = src.match(coversRegex);
      if (coversMatch) {
        const acs = coversMatch[1]!.match(/'(\w+)'/g)?.map(s => s.replace(/'/g, '')) ?? [];
        for (const ac of acs) {
          refs.push({
            feature: featureName,
            featureId: '',
            ac,
            testFile: relPath,
            testName: `(dynamic tests in ${className} covering ${ac})`,
            level,
          });
        }
      }
    }

    const legacyTagRegex = /(?:test|it)\s*\(\s*['"]([^'"]*@(\w+):(\d+)[^'"]*)['"]/g;
    while ((m = legacyTagRegex.exec(src)) !== null) {
      refs.push({
        feature: m[2]!,
        featureId: m[2]!,
        ac: `ac${m[3]}`,
        testFile: relPath,
        testName: m[1]!,
        level,
      });
    }
  }
}

export function computeBindingsSummary(
  feature: FeatureMeta,
  manifest: BindingsManifest | null,
): FeatureBindingsSummary {
  const totalAcs = feature.acMethods.length;
  if (!feature.enabled) {
    return { status: 'disabled', totalAcs, boundAcs: 0, symbols: [] };
  }
  if (!manifest) {
    return { status: 'unbound', totalAcs, boundAcs: 0, symbols: [] };
  }

  const acMap = manifest[feature.id] ?? {};
  const symbols: Array<{ ac: string } & SymbolTarget> = [];
  let boundAcs = 0;

  for (const ac of feature.acMethods) {
    const targets = acMap[ac];
    if (targets && targets.length > 0) {
      boundAcs++;
      for (const t of targets) symbols.push({ ac, ...t });
    }
  }

  let status: BindingsStatus;
  if (boundAcs === 0) status = 'unbound';
  else if (boundAcs < totalAcs) status = 'partial';
  else status = 'bound';

  return { status, totalAcs, boundAcs, symbols };
}

export function crossReference(
  features: FeatureMeta[],
  refs: TestRef[],
  coverage: Map<string, FileCov> | null,
  bindingsManifest: BindingsManifest | null,
  reqClassToId?: ReadonlyMap<string, string>,
): FeatureCoverage[] {
  const classToId = new Map<string, string>();
  for (const f of features) classToId.set(f.className, f.id);

  for (const ref of refs) {
    if (!ref.featureId) {
      ref.featureId = classToId.get(ref.feature) ?? ref.feature;
    }
  }

  return features.map(f => {
    const acDetailMap = new Map(f.acDetails.map(d => [d.name, d]));
    const acs: ACCoverage[] = f.acMethods.map(method => {
      const matchingTests = refs.filter(
        r => (r.featureId === f.id || classToId.get(r.feature) === f.id) && r.ac === method,
      );
      const expectedLevels = acDetailMap.get(method)?.expectedLevels ?? ['unit'] as const;
      const testLevels = new Set(matchingTests.map(t => t.level));
      const coveredLevels = expectedLevels.filter(l => testLevels.has(l));
      const gapLevels = expectedLevels.filter(l => !testLevels.has(l));
      return {
        method,
        tests: matchingTests.map(t => ({ file: t.testFile, name: t.testName, level: t.level })),
        covered: matchingTests.length > 0,
        expectedLevels,
        coveredLevels,
        gapLevels,
      };
    });

    const coveredCount = acs.filter(a => a.covered).length;

    // Runtime coverage: the file set is derived entirely from the inferred
    // bindings manifest. Features no longer declare `sourceFiles`.
    const derivedFiles = deriveFilesFromManifest(bindingsManifest, f.id)
      .filter(file => !coverage || coverage.has(file));

    const satisfies = (f.satisfies ?? []).map(
      cn => reqClassToId?.get(cn) ?? cn,
    );

    return {
      id: f.id,
      title: f.title,
      priority: f.priority,
      enabled: f.enabled,
      sourceFiles: derivedFiles,
      acs,
      coveredCount,
      totalCount: acs.length,
      percentage: acs.length > 0 ? Math.round((coveredCount / acs.length) * 100) : 100,
      runtimeCoverage: computeRuntimeCoverage(derivedFiles, coverage, f.enabled),
      bindings: computeBindingsSummary(f, bindingsManifest),
      satisfies,
    };
  });
}

function deriveFilesFromManifest(manifest: BindingsManifest | null, featureId: string): string[] {
  if (!manifest) return [];
  const featureAcs = manifest[featureId];
  if (!featureAcs) return [];
  const files = new Set<string>();
  for (const targets of Object.values(featureAcs)) {
    for (const t of targets) files.add(t.file);
  }
  return [...files].sort();
}

export function buildJsonPayload(results: FeatureCoverage[], orphans: OrphanFile[]) {
  const activeResults = results.filter(f => f.enabled);
  const totalACs = activeResults.reduce((s, f) => s + f.totalCount, 0);
  const coveredACs = activeResults.reduce((s, f) => s + f.coveredCount, 0);
  const disabledCount = results.length - activeResults.length;

  return {
    timestamp: new Date().toISOString(),
    features: results,
    summary: {
      totalFeatures: results.length,
      activeFeatures: activeResults.length,
      disabledFeatures: disabledCount,
      totalACs,
      coveredACs,
      percentage: totalACs > 0 ? Math.round((coveredACs / totalACs) * 100) : 100,
      criticalUncovered: activeResults
        .filter(f => f.priority === 'critical' && f.percentage < 100)
        .flatMap(f => f.acs.filter(a => !a.covered).map(a => `${f.id}.${a.method}`)),
      runtimeWarnings: activeResults.filter(f => f.percentage === 100 && f.runtimeCoverage.status !== 'ok').length,
      orphanSourceFiles: orphans,
    },
  };
}

export interface GenerateReportOptions {
  root: string;
  featuresDir: string;
  /** Optional Requirements dir (absolute). When provided, @Satisfies class names on Features are resolved to REQ-IDs. */
  requirementsDir?: string;
  bindingsDir: string;
  bindingsManifestPath: string;
  testDirs: readonly string[];
  includeBindings?: boolean;
  writeBindingsManifest?: boolean;
  /** Lock coverage to a specific test-results run (e.g. "2026-04-12T08-00-20"). */
  coverageRunId?: string;
  /** Write the current inferred bindings and compare them with the previous artifact. */
  inferredManifestPath?: string;
  /** Write the previous/current bindings diff and empty-method diagnostics. */
  inferredDiffPath?: string;
  /**
   * Path prefixes (posix, relative to root) the bindings scanner records
   * targets for. Defaults to the scanner's own `src/`, `scripts/`. A repo that
   * measures coverage outside those two trees must widen this to match, or the
   * files it measures can never be claimed and stay orphans forever.
   */
  includeScopes?: readonly string[];
}

export interface GeneratedReport {
  features: FeatureMeta[];
  refs: TestRef[];
  coverage: Map<string, FileCov> | null;
  /** Which test-results run the coverage was loaded from (null if no coverage). */
  coverageRunId: string | null;
  bindingsManifest: BindingsManifest | null;
  inferredManifest: BindingsManifest | null;
  inferredDiff: ManifestDiff | null;
  inferredEmptyMethods: EmptyMethodRef[];
  results: FeatureCoverage[];
  orphans: OrphanFile[];
  /** Map of Requirement className → REQ-ID, populated when requirementsDir is provided. */
  reqClassToId: Map<string, string>;
}

/* Coverage rationale:  — IO glue; tested via integration */
async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const realReadableFileSystem: ReadableFileSystem = {
  async readFile(p, enc) { return fsp.readFile(p, enc); },

  async exists(p) { try { await fsp.access(p); return true; } catch { return false; } },
  async readdir(p) { return fsp.readdir(p); },
  async stat(p) {
    const st = await fsp.stat(p);
    return { mtimeMs: st.mtimeMs, size: st.size, isDirectory: () => st.isDirectory() };
  },
};

export async function generateReport(opts: GenerateReportOptions): Promise<GeneratedReport> {
  const includeBindings = opts.includeBindings !== false;
  const writeManifestFlag = opts.writeBindingsManifest !== false;

  const features = await readFeatures(opts.featuresDir);
  const refs = await scanTestFiles(opts.testDirs, opts.root, realReadableFileSystem);

  // Resolve @Satisfies(ClassName) → REQ-ID by parsing the requirements dir.
  const reqClassToId = new Map<string, string>();
  if (opts.requirementsDir) {
    const reqs = await readRequirements(opts.requirementsDir);
    for (const r of reqs) reqClassToId.set(r.className, r.id);
  }

  const classToId = new Map<string, string>();
  for (const f of features) classToId.set(f.className, f.id);

  // Single source of truth post-Phase-3: the inferred binding manifest
  // produced by walking `*.test.ts` AST. No more manual bindings files.
  const [coverageLocation, inferredScan] = await Promise.all([
    findLatestCoverageSummary(opts.root, opts.coverageRunId),
    includeBindings
      ? scanTestBindings({
          testDirs: opts.testDirs,
          root: opts.root,
          classToId,
          fs: realReadableFileSystem,
          includeScopes: opts.includeScopes,
        })
      : null,
  ]);

  const coverage = coverageLocation ? await loadCoverageSummary(coverageLocation.file, opts.root) : null;
  const coverageRunId = coverageLocation?.runId ?? null;
  const inferredManifest = inferredScan ? sortManifest(inferredScan.manifest) : null;
  const inferredEmptyMethods = inferredScan ? inferredScan.emptyMethods : [];
  const bindingsManifest = inferredManifest;

  // Compare against the previous artifact before replacing it. It never supplies
  // bindings to the current report: the current AST remains the source of truth.
  let inferredDiff: ManifestDiff | null = null;
  if (opts.inferredManifestPath && inferredManifest) {
    let previous: BindingsManifest = {};
    try { previous = JSON.parse(await fsp.readFile(opts.bindingsManifestPath, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    inferredDiff = diffManifests(previous, inferredManifest);
  }

  if (inferredManifest && writeManifestFlag) {
    await writeJsonFile(opts.bindingsManifestPath, inferredManifest);
  }

  if (opts.inferredManifestPath && inferredManifest) {
    await writeJsonFile(opts.inferredManifestPath, inferredManifest);
  }
  if (opts.inferredDiffPath) {
    await fsp.writeFile(
      opts.inferredDiffPath,
      JSON.stringify({ diff: inferredDiff, emptyMethods: inferredEmptyMethods }, null, 2) + '\n',
      'utf8',
    );
  }

  const results = crossReference(features, refs, coverage, bindingsManifest, reqClassToId);

  // The derived-files map feeds orphan detection. Post-Phase-3, every
  // feature's file set comes from the inferred binding manifest.
  const derivedByFeatureId = new Map<string, readonly string[]>();
  for (const f of features) {
    derivedByFeatureId.set(f.id, deriveFilesFromManifest(bindingsManifest, f.id));
  }
  const orphans = coverage
    ? findOrphanSourceFiles(features.filter(f => f.enabled), coverage, derivedByFeatureId)
    : [];

  return {
    features,
    refs,
    coverage,
    coverageRunId,
    bindingsManifest,
    inferredManifest,
    inferredDiff,
    inferredEmptyMethods,
    results,
    orphans,
    reqClassToId,
  };
}


export function glyphFor(f: FeatureCoverage): '✓' | '!' | '✗' | '○' {
  if (!f.enabled) return '○';
  if (f.percentage < 100) return '✗';
  if (f.runtimeCoverage.status !== 'ok') return '!';
  return '✓';
}

export function formatRuntimeCell(rc: RuntimeCoverage): string {
  switch (rc.status) {
    case 'ok':
      return `src ${Math.round(rc.minLinesPct ?? 0)}% (${rc.found} file${rc.found === 1 ? '' : 's'})`;
    case 'partial':
      return `src ${Math.round(rc.minLinesPct!)}% (${rc.found}/${rc.declared} files, ${rc.missing.length} missing)`;
    case 'missing':
      return `src —  (${rc.declared} missing)`;
    case 'undeclared':
      return `src —  (undeclared)`;
    case 'disabled':
      return `src —  [disabled]`;
  }
}

export function formatBindingsCell(f: FeatureCoverage): string {
  const b = f.bindings;
  if (b.status === 'disabled') return 'impl —  [disabled]';

  const tuCount = b.boundAcs;
  const coveredCount = f.acs.filter(a => a.covered).length;
  const e2eCount = coveredCount - tuCount;

  const parts: string[] = [];
  if (tuCount > 0) parts.push(`${tuCount} TU`);
  if (e2eCount > 0) parts.push(`${e2eCount} E2E`);
  if (parts.length === 0) return 'impl —  (unbound)';
  return `impl ${parts.join(' + ')}`;
}

type ColorSet = { r: string; grn: string; ylw: string; red: string; dim: string };

/** Traceability icon: ● = full (all TU), ◐ = partial (mix TU+E2E), ○ = none (all E2E/unbound). */
export function traceabilityGlyph(f: FeatureCoverage): '●' | '◐' | '○' | '—' {
  const b = f.bindings;
  if (b.status === 'disabled') return '—';
  const tuCount = b.boundAcs;
  const coveredCount = f.acs.filter(a => a.covered).length;
  if (tuCount === 0) return '○';
  if (tuCount >= coveredCount) return '●';
  return '◐';
}

export function formatBindingsCellColored(f: FeatureCoverage, C: ColorSet): string {
  const b = f.bindings;
  if (b.status === 'disabled') return `${C.dim}—  [disabled]${C.r}`;

  const tuCount = b.boundAcs;
  const coveredCount = f.acs.filter(a => a.covered).length;
  const e2eCount = coveredCount - tuCount;

  if (tuCount === 0 && e2eCount === 0) return `${C.red}0/${b.totalAcs} (unbound)${C.r}`;

  const tuCell = `${tuCount > 0 ? C.grn : C.dim}${tuCount}${C.r}`;
  const e2eCell = `${e2eCount > 0 ? C.ylw : C.dim}${e2eCount}${C.r}`;
  const tg = traceabilityGlyph(f);
  const tgColor = tg === '●' ? C.grn : tg === '◐' ? C.ylw : C.red;
  return `${tuCell} TU  ${e2eCell} E2E  ${tgColor}${tg}${C.r}`;
}

export interface RenderConsoleOptions {
  useColor: boolean;
  coverageLoaded: boolean;
  /** Which test-results run the coverage was loaded from. */
  coverageRunId: string | null;
  bindingsLoaded: boolean;
  includeBindings: boolean;
  includeOrphans: boolean;
}

export function renderConsole(
  results: FeatureCoverage[],
  orphans: OrphanFile[],
  options: RenderConsoleOptions,
): string {
  const { useColor, coverageLoaded, coverageRunId, bindingsLoaded, includeBindings, includeOrphans } = options;
  const C = useColor
    ? { r: '\x1b[0m', b: '\x1b[1m', red: '\x1b[31m', grn: '\x1b[32m', ylw: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m' }
    : { r: '', b: '', red: '', grn: '', ylw: '', cyan: '', dim: '' };

  const lines: string[] = [];
  lines.push(`\n${C.cyan}${C.b}  ── Feature Compliance Report ──${C.r}`);
  if (coverageRunId) {
    lines.push(`  ${C.dim}coverage from test-results/${coverageRunId}/${C.r}`);
  }
  lines.push('');

  if (!coverageLoaded) {
    lines.push(`  ${C.ylw}⚠ no vitest coverage run found — run \`npm run test:coverage\` first${C.r}\n`);
  }
  if (!bindingsLoaded && includeBindings) {
    lines.push(`  ${C.ylw}⚠ no bindings manifest — run \`npx tsx scripts/build-bindings-manifest.ts\` first${C.r}\n`);
  }

  // ── Collect counters ──
  let totalACs = 0;
  let coveredACs = 0;
  let criticalUncovered = 0;
  let disabledCount = 0;
  let warnCount = 0;

  // ── Build table columns ──
  const anyReqs = results.some(f => f.satisfies.length > 0);
  const cols: TableColumn[] = [
    { header: '', minWidth: 1 },                        // glyph
    { header: 'ID', minWidth: 6 },
    { header: 'Title' },
    { header: 'Total', align: 'right', minWidth: 5 },
    { header: 'Covered', align: 'right', minWidth: 7 },
  ];
  if (includeBindings) {
    cols.push(
      { header: 'TU', align: 'right', minWidth: 3 },
      { header: 'E2E', align: 'right', minWidth: 3 },
    );
  }
  cols.push(
    { header: '%', align: 'right', minWidth: 4 },
    { header: 'src', minWidth: 8 },
  );
  if (anyReqs) {
    cols.push({ header: 'REQs', minWidth: 6 });
  }

  const rows: string[][] = [];
  const missingByFeature: Array<{ id: string; uncovered: readonly string[] }> = [];

  for (const f of results) {
    if (!f.enabled) {
      disabledCount++;
    } else {
      totalACs += f.totalCount;
      coveredACs += f.coveredCount;
    }

    const pct = f.percentage;
    const glyph = glyphFor(f);
    const glyphColor =
      glyph === '✓' ? C.grn : glyph === '✗' ? C.red : glyph === '○' ? C.dim : C.ylw;
    const pctColor = pct === 100 ? C.grn : pct >= 80 ? C.ylw : C.red;
    const srcColor = f.runtimeCoverage.minLinesPct === 100 ? C.grn
      : f.runtimeCoverage.status === 'ok' ? C.ylw : C.dim;
    const uncovered = f.acs.filter(a => !a.covered).map(a => a.method);

    if (glyph === '!') warnCount++;
    if (f.enabled && f.priority === 'critical' && pct < 100) {
      criticalUncovered += f.totalCount - f.coveredCount;
    }

    const covCount = f.acs.filter(a => a.covered).length;
    const covColor = covCount === f.totalCount ? C.grn : covCount > 0 ? C.ylw : C.red;

    const row: string[] = [
      `${glyphColor}${glyph}${C.r}`,
      f.id,
      f.title,
      `${C.b}${f.totalCount}${C.r}`,
      `${covColor}${covCount}${C.r}`,
    ];

    if (includeBindings) {
      const b = f.bindings;
      const tuCount = b.boundAcs;
      const e2eCount = covCount - tuCount;

      row.push(
        tuCount > 0 ? `${C.grn}${tuCount}${C.r}` : `${C.dim}0${C.r}`,
        e2eCount > 0 ? `${C.grn}${e2eCount}${C.r}` : `${C.dim}0${C.r}`,
      );
    }

    // If every bound test is a smoke test (subprocess), display `subprocess ✓`
    // in the src column instead of the "0 files" runtime-coverage cell — it's
    // not an absence of coverage, it's a subprocess/CLI gate.
    const allTests = f.acs.flatMap(a => a.tests);
    const isSubprocessOnly =
      f.enabled &&
      allTests.length > 0 &&
      allTests.every(t => t.level === 'smoke');
    const srcCell = isSubprocessOnly
      ? `${C.grn}subprocess ✓${C.r}`
      : `${srcColor}${formatRuntimeCell(f.runtimeCoverage)}${C.r}`;

    row.push(
      `${pctColor}${pct}%${C.r}`,
      srcCell,
    );

    if (anyReqs) {
      const reqCell = f.satisfies.length > 0
        ? f.satisfies.join(', ')
        : `${C.dim}—${C.r}`;
      row.push(reqCell);
    }

    if (uncovered.length > 0) {
      missingByFeature.push({ id: f.id, uncovered });
    }

    rows.push(row);
  }

  // ── Render table ──
  const tableLines = table(cols, rows, {
    indent: 2,
    headerColor: (s: string) => `${C.dim}${s}${C.r}`,
    separatorColor: (s: string) => `${C.dim}${s}${C.r}`,
  });
  lines.push(...tableLines);

  // ── Summary ──
  const totalTests = results.reduce((s, f) => s + f.acs.reduce((a, ac) => a + ac.tests.length, 0), 0);
  const totalPct = totalACs > 0 ? Math.round((coveredACs / totalACs) * 100) : 100;
  const activeCount = results.length - disabledCount;

  lines.push('');
  lines.push(
    `  ${C.b}Features: ${activeCount} active${disabledCount > 0 ? `, ${disabledCount} disabled` : ''}${C.r}`,
  );
  lines.push(`  ${C.b}Acceptance criteria: ${coveredACs}/${totalACs} ACs covered (${totalPct}%)${C.r}`);
  lines.push(`  ${C.b}Total tests linked to ACs: ${totalTests}${C.r} ${C.dim}(legacy .js tests not yet migrated to .ts are unlinked)${C.r}`);
  lines.push(`  ${C.b}Runtime coverage warnings: ${warnCount === 0 ? `${C.grn}0` : `${C.ylw}${warnCount}`}${C.r}`);
  if (includeBindings) {
    const unboundIds = results
      .filter(f => f.enabled && (f.percentage < 100 || (f.bindings.status === 'unbound' && f.coveredCount === 0)))
      .map(f => f.id);
    const unboundLabel = unboundIds.length === 0
      ? `${C.grn}0`
      : `${C.ylw}${unboundIds.length} (${unboundIds.join(', ')})`;
    lines.push(`  ${C.b}Unbound features: ${unboundLabel}${C.r}`);
  }
  lines.push(`  ${C.b}Critical uncovered: ${criticalUncovered === 0 ? `${C.grn}0` : `${C.red}${criticalUncovered}`}${C.r}`);
  lines.push(`  ${C.b}Orphan source files: ${orphans.length === 0 ? `${C.grn}0` : `${C.ylw}${orphans.length}`}${C.r}`);
  lines.push(`  ${C.b}Quality gate: ${criticalUncovered === 0 && totalPct >= 80 ? `${C.grn}PASS` : `${C.red}FAIL`}${C.r}\n`);

  if (missingByFeature.length > 0) {
    lines.push(`  ${C.cyan}${C.b}── Missing ACs ──${C.r}`);
    for (const m of missingByFeature) {
      lines.push(`    ${m.id}`);
      for (const ac of m.uncovered) {
        lines.push(`      ${C.dim}· ${ac}${C.r}`);
      }
    }
    lines.push('');
  }

  if (includeOrphans && orphans.length > 0) {
    lines.push(`  ${C.cyan}${C.b}── Source files not claimed by any feature ──${C.r}`);
    for (const o of orphans) {
      lines.push(`    ${o.file.padEnd(50)} ${C.dim}lines ${Math.round(o.linesPct)}%${C.r}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderByTest(refs: TestRef[], classToId: Map<string, string>, useColor: boolean): string {
  const C = useColor
    ? { r: '\x1b[0m', b: '\x1b[1m', cyan: '\x1b[36m', dim: '\x1b[2m' }
    : { r: '', b: '', cyan: '', dim: '' };

  const byFile = new Map<string, { feature: string; ac: string; name: string }[]>();
  for (const ref of refs) {
    const featureId = ref.featureId || classToId.get(ref.feature) || ref.feature;
    if (!byFile.has(ref.testFile)) byFile.set(ref.testFile, []);
    byFile.get(ref.testFile)!.push({ feature: featureId, ac: ref.ac, name: ref.testName });
  }

  const lines: string[] = [];
  lines.push(`\n${C.cyan}${C.b}  ── Test → Feature Mapping ──${C.r}\n`);

  for (const [file, entries] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`  ${C.b}${file}${C.r}`);
    const byFeature = new Map<string, string[]>();
    for (const e of entries) {
      if (!byFeature.has(e.feature)) byFeature.set(e.feature, []);
      byFeature.get(e.feature)!.push(e.ac);
    }
    for (const [feat, acs] of [...byFeature.entries()].sort()) {
      lines.push(`    ${C.cyan}${feat}${C.r}: ${C.dim}${acs.join(', ')}${C.r}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function buildByTestJson(refs: TestRef[], classToId: Map<string, string>) {
  const byFile: Record<string, Record<string, string[]>> = {};
  for (const ref of refs) {
    const featureId = ref.featureId || classToId.get(ref.feature) || ref.feature;
    if (!byFile[ref.testFile]) byFile[ref.testFile] = {};
    if (!byFile[ref.testFile]![featureId]) byFile[ref.testFile]![featureId] = [];
    byFile[ref.testFile]![featureId]!.push(ref.ac);
  }
  return { timestamp: new Date().toISOString(), testFiles: byFile };
}
