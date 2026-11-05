/** Runner adapters keep test outcomes, coverage counters and mutant states distinct. */
import * as path from 'node:path';
import { qualificationTestId, type QualificationCoverage, type QualificationEvidence, type QualificationInventory, type QualificationMutantStatus } from './qualification.js';

export interface QualificationRunnerReport {
  readonly success: boolean;
  readonly testResults: readonly {
    readonly name: string;
    readonly status?: string;
    readonly assertionResults: readonly { readonly title: string; readonly ancestorTitles: readonly string[]; readonly status: string }[];
  }[];
}

/** Understand both OS path syntaxes without depending on the evaluator's host OS. */
export function qualificationRelativeFile(file: string, root: string): string {
  const normalized = file.replaceAll('\\', '/'), base = root.replaceAll('\\', '/').replace(/\/$/, '');
  if (normalized.startsWith(base + '/')) return normalized.slice(base.length + 1);
  return path.posix.normalize(normalized);
}

/** Only the same file (or an explicit forwarding import), class and test title can match. */
export function adaptQualificationTests(report: QualificationRunnerReport, root: string, inventory: QualificationInventory): QualificationEvidence['tests'] {
  const tests: QualificationEvidence['tests'][number][] = [];
  for (const suite of report.testResults) {
    const file = qualificationRelativeFile(suite.name, root);
    const files = new Set([file, ...(inventory.testAliases?.[file] ?? [])]);
    for (const result of suite.assertionResults) {
      const matches = inventory.tests.filter(t => files.has(t.file) && result.ancestorTitles.includes(t.className) && result.title === t.name);
      if (matches.length) for (const id of new Set(matches.map(t => t.id))) tests.push({ id, status: result.status });
      else tests.push({ id: qualificationTestId(file, result.ancestorTitles.join(' > '), result.title), status: result.status });
    }
    if (suite.status === 'failed' && !suite.assertionResults.some(r => r.status === 'failed')) tests.push({ id: qualificationTestId(file, '<suite>', '<failure>'), status: 'failed' });
  }
  if (!report.success && !tests.some(t => t.status === 'failed')) tests.push({ id: '<runner-failure>', status: 'failed' });
  return tests;
}

/** Forwarded property suites use the same canonical file/class/method identity as runner tests. */
export function adaptQualificationStrategy(strategy: QualificationEvidence['strategies'][number], inventory: QualificationInventory): QualificationEvidence['strategies'][number] {
  if (inventory.tests.some(test => test.id === strategy.testId)) return strategy;
  let parts: unknown;
  try { parts = JSON.parse(strategy.testId); } catch { return strategy; }
  if (!Array.isArray(parts) || parts.length !== 3 || !parts.every(part => typeof part === 'string')) return strategy;
  const [file, className, name] = parts as [string, string, string];
  const forwarded = inventory.testAliases?.[file] ?? [];
  const matches = new Set(inventory.tests.filter(test => forwarded.includes(test.file) && test.className === className && test.name === name).map(test => test.id));
  return matches.size === 1 ? { ...strategy, testId: [...matches][0]! } : strategy;
}

/** Coverage percentages are never trusted: the evaluator uses integer covered/total counts. */
export function adaptQualificationCoverage(summary: Readonly<Record<string, QualificationCoverage>>, root: string): QualificationEvidence['coverage'] {
  return Object.fromEntries(Object.entries(summary).filter(([file]) => file !== 'total').map(([file, coverage]) => [qualificationRelativeFile(file, root), coverage]));
}

/** Preserve every status, including excluded/error/pending mutants which block qualification. */
export function adaptQualificationMutation(report: { readonly files: Readonly<Record<string, { readonly mutants: readonly { readonly status: string }[] }>> }, root: string): QualificationEvidence['mutation']['files'] {
  return Object.fromEntries(Object.entries(report.files).map(([file, data]) => [qualificationRelativeFile(file, root), data.mutants.map(mutant => mutant.status as QualificationMutantStatus)]));
}
