/** Filesystem adapter for the pure qualification engine. It never starts a test runner. */
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { readQualificationInventory } from './qualification-inventory.js';
import { evaluateQualification, type QualificationEvidence, type QualificationPolicy, type QualificationReport, type QualificationInventory, type QualificationCoverage } from './qualification.js';
import { adaptQualificationTests, adaptQualificationStrategy, adaptQualificationCoverage, adaptQualificationMutation, type QualificationRunnerReport } from './qualification-evidence.js';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stringRecord(value: unknown): value is Record<string, string> {
  return object(value) && Object.values(value).every(item => typeof item === 'string');
}
function list(value: unknown, predicate: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value) && value.every(item => object(item) && predicate(item));
}

/** Reject malformed external JSON before it reaches the typed evaluator. */
export function parseQualificationEvidence(text: string): QualificationEvidence {
  const e: unknown = JSON.parse(text);
  if (!object(e) || e.schemaVersion !== 1 || !['win32', 'linux'].includes(String(e.platform)) || typeof e.projectRoot !== 'string' || !e.projectRoot || typeof e.runId !== 'string' || typeof e.startedAt !== 'string' || typeof e.completedAt !== 'string' || !['complete', 'interrupted'].includes(String(e.state)) ||
    !stringRecord(e.hashesBefore) || !stringRecord(e.hashesAfter) || !stringRecord(e.buildHashesBefore) || !stringRecord(e.buildHashesAfter) || !stringRecord(e.artifacts) || !stringRecord(e.toolsBefore) || !stringRecord(e.tools) ||
    !list(e.tests, t => typeof t.id === 'string' && typeof t.status === 'string') ||
    !object(e.coverage) || !Object.values(e.coverage).every(file => object(file) && ['lines', 'branches', 'functions', 'statements'].every(metric => object(file[metric]) && typeof file[metric].total === 'number' && typeof file[metric].covered === 'number')) ||
    !list(e.strategies, s => typeof s.testId === 'string' && ['property', 'fuzz'].includes(String(s.strategy)) && typeof s.runs === 'number' && typeof s.seed === 'number' && typeof s.status === 'string') ||
    !object(e.mutation) || typeof e.mutation.staticMutants !== 'boolean' || typeof e.mutation.incremental !== 'boolean' || !object(e.mutation.files) || !Object.values(e.mutation.files).every(statuses => Array.isArray(statuses) && statuses.every(s => typeof s === 'string')) ||
    !stringRecord(e.checks) || !['typecheck', 'distribution', 'orchestration'].every(key => typeof (e.checks as Record<string, unknown>)[key] === 'string')) throw new TypeError('Invalid qualification evidence schema (version 1 required).');
  return e as unknown as QualificationEvidence;
}

/** Hash-identified reports and builds must still exist and match their retained bytes. */
export async function verifyQualificationArtifacts(root: string, artifacts: Readonly<Record<string, string>>): Promise<string[]> {
  const invalid: string[] = [];
  for (const [file, hash] of Object.entries(artifacts)) {
    const target = resolve(root, file), rel = relative(root, target);
    if (isAbsolute(file) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) { invalid.push(file); continue; }
    try {
      const actual = await realpath(target), base = await realpath(root), actualRelative = relative(base, actual);
      if (actualRelative === '..' || actualRelative.startsWith('..\\') || actualRelative.startsWith('../') || isAbsolute(actualRelative)) { invalid.push(file); continue; }
      if (createHash('sha256').update(await readFile(actual)).digest('hex') !== hash) invalid.push(file);
    } catch { invalid.push(file); }
  }
  return invalid;
}

/** Compare records independently of key insertion order, retaining duplicate runner executions. */
function canonical(value: unknown): string {
  const sort = (item: unknown): unknown => Array.isArray(item) ? item.map(sort) : object(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, sort(value)])) : item;
  return JSON.stringify(sort(value));
}

/** Recompute projections from hash-verified raw reports; editable summary booleans are not proof. */
export async function verifyQualificationProjection(root: string, run: QualificationEvidence, inventory: QualificationInventory): Promise<string[]> {
  const problems: string[] = [], tests: QualificationEvidence['tests'][number][] = [], strategies: QualificationEvidence['strategies'][number][] = [];
  const coverage: Record<string, QualificationCoverage> = {}, mutants: Record<string, QualificationEvidence['mutation']['files'][string]> = {};
  const proofFiles = Object.keys(run.artifacts).filter(file => file.includes(`/${run.runId}/`)).sort();
  const buildHashes = (stage: string) => Object.fromEntries(proofFiles.filter(file => file.includes(`/${run.runId}/${stage}/`)).map(file => [file.split(`/${run.runId}/${stage}/`)[1]!, run.artifacts[file]]));
  if (canonical(buildHashes('build-before')) !== canonical(run.buildHashesBefore) || canonical(buildHashes('build-after')) !== canonical(run.buildHashesAfter)) problems.push('build snapshot');
  const read = async (file: string): Promise<Record<string, unknown>> => {
    const value: unknown = JSON.parse(await readFile(resolve(root, file), 'utf8'));
    if (!object(value)) throw new TypeError(`Invalid raw report: ${file}`);
    return value;
  };
  const one = async (name: string): Promise<Record<string, unknown>> => {
    const files = proofFiles.filter(file => file.endsWith('/' + name));
    if (files.length !== 1) throw new Error(`Exactly one retained ${name} is required.`);
    return read(files[0]!);
  };
  for (const file of proofFiles) {
    if (/(?:^|\/)(?:tests|smoke-tests|integration-tests|qualification-tests)\.json$/.test(file)) {
      const report = await read(file);
      if (typeof report.success !== 'boolean' || !Array.isArray(report.testResults)) throw new TypeError(`Invalid test report: ${file}`);
      tests.push(...adaptQualificationTests(report as unknown as QualificationRunnerReport, run.projectRoot, inventory));
    } else if (file.endsWith('/coverage-summary.json')) {
      const summary = adaptQualificationCoverage(await read(file) as unknown as Record<string, QualificationCoverage>, run.projectRoot);
      const owner = /^packages\/([^/]+)\//.exec(file)?.[1];
      for (const [target, counters] of Object.entries(summary)) if (!owner || target.startsWith(`packages/${owner}/`)) coverage[target] = counters;
    } else if (file.endsWith('/mutation-report.json')) {
      const report = await read(file);
      const owner = /\/mutation\/([^/]+)\/mutation-report\.json$/.exec(file)?.[1];
      const files = adaptQualificationMutation(report as unknown as Parameters<typeof adaptQualificationMutation>[0], run.projectRoot);
      for (const [target, statuses] of Object.entries(files)) mutants[owner && !target.startsWith('packages/') ? `packages/${owner}/${target}` : target] = statuses;
    } else if (file.includes('/strategies/') && file.endsWith('.json')) strategies.push(adaptQualificationStrategy(await read(file) as unknown as QualificationEvidence['strategies'][number], inventory));
  }
  const sortedTests = (items: QualificationEvidence['tests']) => [...items].sort((a, b) => canonical(a).localeCompare(canonical(b)));
  const sortedStrategies = (items: QualificationEvidence['strategies']) => [...items].sort((a, b) => canonical(a).localeCompare(canonical(b)));
  for (const [name, actual, claimed] of [['tests', sortedTests(tests), sortedTests(run.tests)], ['coverage', coverage, run.coverage], ['mutation', mutants, run.mutation.files], ['strategies', sortedStrategies(strategies), sortedStrategies(run.strategies)]] as const) if (canonical(actual) !== canonical(claimed)) problems.push(name);
  const before = await one('inputs-before.json'), summary = await one('summary.json'), policy = await one('mutation-policy.json'), tools = await one('tool-versions.json');
  if (before.runId !== run.runId || before.platform !== run.platform || before.projectRoot !== run.projectRoot || before.startedAt !== run.startedAt || canonical(before.hashes) !== canonical(run.hashesBefore) || canonical(before.buildHashes) !== canonical(run.buildHashesBefore) || canonical(before.tools) !== canonical(run.toolsBefore)) problems.push('input snapshot');
  if (canonical(tools) !== canonical(run.tools)) problems.push('tool versions');
  const rows = summary.Runs;
  if (!Array.isArray(rows)) throw new TypeError('Invalid campaign summary.');
  const passed = (name: string) => rows.some(row => object(row) && row.Name === name && row.State === 'Success') ? 'passed' : 'missing';
  const checks = { typecheck: passed('test-types'), distribution: passed('distribution'), orchestration: passed('qualification-tests') === 'passed' ? 'passed' : passed('integration') };
  if (canonical(checks) !== canonical(run.checks)) problems.push('independent checks');
  const state = summary.Done && rows.every(row => object(row) && row.State === 'Success') ? 'complete' : 'interrupted';
  if (summary.TestRunId !== run.runId || state !== run.state) problems.push('campaign lifecycle');
  if ((policy.ignoreStatic === false) !== run.mutation.staticMutants || (policy.incremental !== false) !== run.mutation.incremental) problems.push('mutation policy');
  return problems;
}

export interface QualifyProjectOptions {
  readonly root: string;
  readonly evidencePaths?: readonly string[];
  readonly policy?: QualificationPolicy;
}

/** Missing, malformed and changed proof files produce a failing report, not a static pass. */
export async function qualifyProject(options: QualifyProjectOptions): Promise<QualificationReport> {
  const root = resolve(options.root), inventory = await readQualificationInventory(root);
  const diagnostics = [...inventory.diagnostics], evidence: QualificationEvidence[] = [];
  for (const file of options.evidencePaths ?? []) {
    try {
      const run = parseQualificationEvidence(await readFile(resolve(root, file), 'utf8'));
      const invalid = await verifyQualificationArtifacts(root, run.artifacts);
      for (const artifact of invalid) diagnostics.push({ code: 'changed-artifact', subject: artifact, message: 'A retained build/report is missing, outside the project, or has different SHA-256 bytes.' });
      if (!invalid.length) {
        try {
          for (const projection of await verifyQualificationProjection(root, run, inventory)) diagnostics.push({ code: 'altered-evidence-projection', subject: `${file}:${projection}`, message: 'The claimed evidence differs from the retained individual raw reports.' });
        } catch (error) {
          diagnostics.push({ code: 'incomplete-evidence-projection', subject: file, message: String(error) });
        }
      }
      evidence.push(run);
    } catch (error) {
      diagnostics.push({ code: 'unreadable-evidence', subject: file, message: String(error) });
    }
  }
  return evaluateQualification({ ...inventory, diagnostics }, evidence, options.policy);
}
