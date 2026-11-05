#!/usr/bin/env node
/**
 * rsd — Requirements Styles Demo scenario CLI.
 *
 * Self-contained Commander shell for scenario-driven project generation
 * (play / record / list / validate / inspect / export). Wires the demo's
 * scenario command cores to real I/O, with the wizard cores and ports
 * coming from `@frenchexdev2/requirements-lib` / `-core`.
 */

import { Command } from 'commander';
import * as path from 'path';
import { promises as fsp } from 'fs';
import { fileURLToPath } from 'node:url';

import type { Clock, FileSystem, Logger } from '@frenchexdev2/requirements-core/ports';
import { runFeatureWizard } from '@frenchexdev2/requirements-wizards/feature-new-core';
import { runRequirementWizard } from '@frenchexdev2/requirements-wizards/requirement-core';

import {
  validateScenario as scValidate,
  listScenarios as scList,
  renderListText,
  renderListJson,
  inspectScenario as scInspect,
  playScenario as scPlay,
  recordFromProject as scRecordFromProject,
  exportScenario as scExport,
  computeFallbackPlan,
  type SchemaValidator as ScenarioSchemaValidator,
  type Orchestrator as ScenarioOrchestrator,
  type ExportFormat,
} from '../commands.js';
import { makeScenarioOrchestratorPort } from '../orchestrator-port.js';
import { selectAdapter as selectAiAdapter } from '../ai-adapter.js';
import type { OrchestratorDeps } from '../orchestrator.js';
import type { UiEvent, FsmId } from '../event-bridge.js';
import { realPrompt } from '../prompt-shell.js';

const realFs: FileSystem = {
  readFile: (p: string) => fsp.readFile(p, 'utf8'),
  writeFile: (p: string, d: string) => fsp.writeFile(p, d, 'utf8'),
  exists: async (p: string) => { try { await fsp.stat(p); return true; } catch { return false; } },
  readdir: (p: string) => fsp.readdir(p),
  stat: (p: string) => fsp.stat(p),
  mkdir: (p: string) => fsp.mkdir(p, { recursive: true }).then(() => {}),
};

const fmt = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

function formatFsmId(id: FsmId): string {
  switch (id.kind) {
    case 'project': return 'project';
    case 'feature': return `feature ${id.featureId}`;
    case 'ac':      return `ac ${id.featureId}.${id.acName}`;
  }
}

function formatUiEvent(e: UiEvent): string {
  switch (e.kind) {
    case 'FsmStarted':    return fmt.dim(`▶ ${formatFsmId(e.fsm)} (${e.initialState})`);
    case 'FsmTransition': return fmt.dim(`  ${formatFsmId(e.fsm)}: ${e.from} → ${e.to}`);
    case 'FsmFinished':   return e.ok
      ? fmt.green(`✓ ${formatFsmId(e.fsm)} → ${e.finalState}`)
      : fmt.red(`✗ ${formatFsmId(e.fsm)} → ${e.finalState}`);
    case 'Narration':     return fmt.cyan(e.text);
  }
}

const __binDir = path.dirname(fileURLToPath(import.meta.url));
const __scenarioSchemaPath = path.resolve(__binDir, '..', '..', 'schemas', 'scenario.schema.json');
const __builtInScenariosDir = path.resolve(__binDir, '..', '..', 'scenarios');

/** Minimal scenario-schema validator: ajv-backed, loaded on demand. */
async function makeScenarioValidator(): Promise<ScenarioSchemaValidator> {
  const schemaPath = __scenarioSchemaPath;
  let schema: unknown;
  try {
    schema = JSON.parse(await fsp.readFile(schemaPath, 'utf8'));
  } catch {
    // Fall through with undefined; validate() will fail with a clear message.
  }
  const AjvMod: unknown = await import('ajv');
  type AjvCtor = new (opts?: { allErrors?: boolean; strict?: boolean }) => {
    compile: (s: unknown) => ((d: unknown) => boolean) & { errors?: readonly { instancePath: string; message?: string }[] | null };
  };
  const AjvCtor = ((AjvMod as { default?: AjvCtor }).default ?? (AjvMod as AjvCtor)) as AjvCtor;
  const ajv = new AjvCtor({ allErrors: true, strict: false });
  const validator = schema ? ajv.compile(schema) : null;
  return {
    async validate(data: unknown) {
      if (!validator) return { ok: false, errors: [{ path: '/', message: `scenario schema not found at ${schemaPath}` }] };
      const ok = validator(data);
      if (ok) return { ok: true, errors: [] };
      return {
        ok: false,
        errors: (validator.errors ?? []).map((e) => ({ path: e.instancePath || '/', message: e.message ?? 'invalid' })),
      };
    },
  };
}

const program = new Command()
  .name('rsd')
  .description('Requirements Styles Demo — scenario-driven project generation (play / record / list / validate / inspect / export)')
  .version('0.0.1');

program.command('play <scenario>')
  .description('Replay a scenario file end-to-end (3-FSM orchestrator + compliance --strict)')
  .option('--ai', 'Use the AI adapter (Claude); default: stub adapter', false)
  .option('--no-ai', 'Force the deterministic stub adapter')
  .option('--seed <n>', 'Deterministic RNG seed', (v) => Number(v), 0)
  .option('--dry-run', 'Plan only; no writes', false)
  .action(async (file: string, opts: { ai?: boolean; seed?: number; dryRun?: boolean }) => {
    const raw = await fsp.readFile(path.resolve(process.cwd(), file), 'utf8');
    const validator = await makeScenarioValidator();
    const orchestrator: ScenarioOrchestrator = opts.dryRun
      ? {
          plan: (s) => computeFallbackPlan(s),
          run: async () => ({ transitions: [], artifacts: [], complianceOk: true, complianceOutput: '' }),
        }
      : makeScenarioOrchestratorPort({
          fs: realFs,
          clock: { now: () => Date.now() } satisfies Clock,
          logger: {
            info: (m) => console.log(m),
            warn: (m) => console.warn(m),
            error: (m) => console.error(m),
          } satisfies Logger,
          prompt: realPrompt(),
          aiAdapter: selectAiAdapter({ ai: !!opts.ai }),
          runFeatureWizard,
          runRequirementWizard,
        } satisfies Omit<OrchestratorDeps, 'ai'>);
    const live = !opts.dryRun;
    const onUiEvent = live ? (e: UiEvent) => console.log(formatUiEvent(e)) : undefined;
    const r = await scPlay(raw, validator, orchestrator, realFs, {
      ai: !!opts.ai, seed: opts.seed ?? 0, dryRun: !!opts.dryRun, cwd: process.cwd(),
    }, onUiEvent);
    if (!live) {
      if (r.narrationIntro) console.log(fmt.cyan(r.narrationIntro));
      for (const t of r.transitions) console.log(fmt.dim(`  ${t.fsm}: ${t.from} → ${t.to} on ${t.event}`));
      if (r.narrationOutro) console.log(fmt.cyan(r.narrationOutro));
    }
    for (const e of r.errors) console.error(fmt.red(`  ✗ ${e}`));
    if (r.exitCode !== 0) process.exit(r.exitCode);
  });

program.command('record [name]')
  .description('Capture an existing project (or wizard session) into a scenario JSON')
  .option('--from-project <dir>', 'Walk an existing project dir and extract seeds')
  .option('--out <path>', 'Output file', 'scenarios/recorded.scenario.json')
  .option('--force', 'Overwrite existing file', false)
  .action(async (name: string | undefined, opts: { fromProject?: string; out: string; force?: boolean }) => {
    const outPath = path.resolve(process.cwd(), opts.out);
    if (opts.fromProject) {
      const r = await scRecordFromProject(realFs, {
        projectDir: path.resolve(process.cwd(), opts.fromProject),
        outPath,
        force: opts.force,
        id: name,
      });
      if (!r.ok) { for (const e of r.errors) console.error(fmt.red(`  ✗ ${e}`)); process.exit(1); }
      console.log(fmt.green(`  ✓ Wrote ${path.relative(process.cwd(), r.wrote!)}`));
    } else {
      console.error(fmt.red('Interactive record mode is not yet wired into the CLI. Use --from-project <dir>.'));
      process.exit(1);
    }
  });

program.command('list')
  .description('List built-in and project-defined scenarios')
  .option('--json', 'JSON output')
  .action(async (opts: { json?: boolean }) => {
    const builtInDir = __builtInScenariosDir;
    const projectDir = path.resolve(process.cwd(), 'scenarios');
    const r = await scList(realFs, { builtInDir, projectDir });
    if (opts.json) console.log(renderListJson(r));
    else console.log(renderListText(r));
  });

program.command('validate <scenario>')
  .description('Validate a scenario file against the JSON Schema and cross-refs')
  .option('--strict', 'Treat forward-reference warnings as errors', false)
  .action(async (file: string, opts: { strict?: boolean }) => {
    const raw = await fsp.readFile(path.resolve(process.cwd(), file), 'utf8');
    const validator = await makeScenarioValidator();
    const r = await scValidate(raw, validator, { strict: !!opts.strict });
    for (const w of r.warnings) console.error(fmt.yellow(`  ⚠ ${w}`));
    for (const e of r.errors) console.error(fmt.red(`  ✗ ${e}`));
    if (r.ok) console.log(fmt.green('  ✓ scenario validates'));
    process.exit(r.exitCode);
  });

program.command('inspect <scenario>')
  .description('Dry-run: print the FSM transition sequence (no side effects)')
  .option('--mermaid', 'Output Mermaid state diagram', false)
  .action(async (file: string, opts: { mermaid?: boolean }) => {
    const raw = await fsp.readFile(path.resolve(process.cwd(), file), 'utf8');
    const validator = await makeScenarioValidator();
    const r = await scInspect(raw, validator, null, { mermaid: !!opts.mermaid });
    if ('rendering' in r) console.log(r.rendering);
    else { for (const e of r.errors) console.error(fmt.red(`  ✗ ${e}`)); process.exit(r.exitCode); }
  });

program.command('export <scenario>')
  .description('Post-run export (Markdown / HTML / PDF — HTML/PDF are stubs)')
  .requiredOption('--format <fmt>', 'md | html | pdf')
  .option('--out <path>', 'Output file', 'scenario-export.md')
  .option('--force', 'Overwrite existing file', false)
  .action(async (file: string, opts: { format: ExportFormat; out: string; force?: boolean }) => {
    const raw = await fsp.readFile(path.resolve(process.cwd(), file), 'utf8');
    const validator = await makeScenarioValidator();
    const r = await scExport(raw, validator, null, realFs, {
      format: opts.format,
      outPath: path.resolve(process.cwd(), opts.out),
      force: opts.force,
    });
    if (!r.ok) { for (const e of r.errors) console.error(fmt.red(`  ✗ ${e}`)); process.exit(r.exitCode); }
    console.log(fmt.green(`  ✓ Wrote ${path.relative(process.cwd(), r.wrote!)}`));
  });

program.parse();
