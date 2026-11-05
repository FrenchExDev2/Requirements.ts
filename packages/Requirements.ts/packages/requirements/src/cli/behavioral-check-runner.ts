/**
 * Stryker runner for `requirements behavioral-check`.
 *
 * Side-effecting layer on top of the pure planning + config builder that live
 * in `@frenchexdev2/requirements-lib/analysis`. Spawns `npx stryker run` in the
 * package directory, then reads the JSON mutation report to compute the
 * mutation score.
 *
 * Cost: ~5-10 min/run. NEVER call from `compliance --strict` or CI.
 */

import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { StrykerConfigSnapshot } from '@frenchexdev2/requirements-lib/analysis';

const _require = createRequire(import.meta.url);

export interface RunStrykerOptions {
  /** Absolute path of the package the run is scoped to (cwd of the spawn). */
  readonly packageRoot: string;
  /** Absolute path of the monorepo root (where Stryker is hoisted by pnpm). */
  readonly repoRoot: string;
  /** Output of `buildStrykerConfig` — a JSON-serialisable Stryker config. */
  readonly config: StrykerConfigSnapshot;
  /** Path (relative to packageRoot) for the temp Stryker config file. Default `.stryker-tmp-behavioral.conf.json`. */
  readonly configFileName?: string;
  /** Path (relative to packageRoot) of the JSON mutation report Stryker writes. Default `reports/mutation/mutation.json`. */
  readonly reportFileName?: string;
  /** Logger for the runner's own status messages. Defaults to `console`. */
  readonly logger?: { readonly info: (m: string) => void; readonly error: (m: string) => void };
}

export interface MutationRunResult {
  readonly killed: number;
  readonly survived: number;
  readonly timeout: number;
  readonly noCoverage: number;
  readonly runtimeErrors: number;
  readonly compileErrors: number;
  readonly total: number;
  readonly mutationScorePercent: number;
  readonly reportFile: string;
}

const DEFAULT_CONFIG_NAME = '.stryker-tmp-behavioral.conf.json';
const DEFAULT_REPORT_NAME = path.join('reports', 'mutation', 'mutation.json');

export async function runStrykerForPlan(opts: RunStrykerOptions): Promise<MutationRunResult> {
  const log = opts.logger ?? console;
  const configPath = path.join(opts.packageRoot, opts.configFileName ?? DEFAULT_CONFIG_NAME);
  const reportPath = path.join(opts.packageRoot, opts.reportFileName ?? DEFAULT_REPORT_NAME);

  await fsp.writeFile(configPath, JSON.stringify(opts.config, null, 2), 'utf8');
  log.info(`  → wrote temp config: ${path.relative(opts.packageRoot, configPath)}`);

  try {
    // A successful child must produce this run's report; never reuse stale evidence.
    await fsp.rm(reportPath, { force: true });
    const strykerJs = resolveStrykerBin(opts.repoRoot);
    await spawnStryker(opts.packageRoot, strykerJs, configPath, log);
  } finally {
    try { await fsp.unlink(configPath); } catch { /* ignore */ }
  }

  const raw = await fsp.readFile(reportPath, 'utf8');
  return summariseReport(JSON.parse(raw) as MutationReport, reportPath);
}

/**
 * Resolve the absolute path to Stryker's executable JS entrypoint by reading
 * `@stryker-mutator/core/package.json#bin.stryker`. Looks up the package from
 * `repoRoot` (pnpm hoists devDeps to the monorepo root).
 *
 * Why not just spawn `stryker` and rely on PATH? `node_modules/.bin/stryker`
 * on Windows is a `.cmd` shim; spawn() needs `shell: true` to resolve it,
 * which triggers `DEP0190` in Node 22+. Resolving the JS entry sidesteps both.
 */
function resolveStrykerBin(repoRoot: string): string {
  const pkgPath = _require.resolve('@stryker-mutator/core/package.json', { paths: [repoRoot] });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = _require(pkgPath) as { bin?: Record<string, string> | string };
  const binEntry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.stryker;
  if (!binEntry) throw new Error(`@stryker-mutator/core has no "bin.stryker" entry at ${pkgPath}`);
  return path.resolve(path.dirname(pkgPath), binEntry);
}

function spawnStryker(
  packageRoot: string,
  strykerJs: string,
  configPath: string,
  log: NonNullable<RunStrykerOptions['logger']>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    log.info(`  → spawning: node ${path.relative(packageRoot, strykerJs)} run ${path.relative(packageRoot, configPath)} (cwd=${packageRoot})`);
    const child = spawn(process.execPath, [strykerJs, 'run', configPath], {
      cwd: packageRoot,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`stryker exited with code ${code ?? 'null'}`));
    });
  });
}

interface MutantSummary { readonly status: string }
interface MutationReportFile { readonly mutants?: ReadonlyArray<MutantSummary> }
interface MutationReport { readonly files?: Record<string, MutationReportFile> }

/**
 * Summarise a Stryker JSON report. Mutation score is computed as
 * (killed + timeout) / (killed + timeout + survived + noCoverage) × 100.
 * Stryker counts timeouts as detected and uncovered mutants as undetected.
 * Compile/runtime errors are excluded from the score.
 */
export function summariseReport(report: MutationReport, reportFile: string): MutationRunResult {
  let killed = 0, survived = 0, timeout = 0, noCoverage = 0, runtimeErrors = 0, compileErrors = 0;
  for (const fileResult of Object.values(report.files ?? {})) {
    for (const mutant of fileResult.mutants ?? []) {
      switch (mutant.status) {
        case 'Killed': killed++; break;
        case 'Survived': survived++; break;
        case 'Timeout': timeout++; break;
        case 'NoCoverage': noCoverage++; break;
        case 'RuntimeError': runtimeErrors++; break;
        case 'CompileError': compileErrors++; break;
        default: /* Pending, Ignored, etc. — not counted */ break;
      }
    }
  }
  const denominator = killed + survived + timeout + noCoverage;
  const mutationScorePercent = denominator > 0 ? ((killed + timeout) / denominator) * 100 : 0;
  const total = killed + survived + timeout + noCoverage + runtimeErrors + compileErrors;
  return { killed, survived, timeout, noCoverage, runtimeErrors, compileErrors, total, mutationScorePercent, reportFile };
}
