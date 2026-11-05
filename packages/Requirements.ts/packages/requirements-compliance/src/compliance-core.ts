import { readdir, readFile, stat } from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';

export type TestLevel = 'unit' | 'functional' | 'e2e' | 'a11y' | 'i18n' | 'visual' | 'perf' | 'smoke' | 'integration';

export interface ACMeta {
  name: string;
  expectedLevels: readonly TestLevel[];
}

export interface FeatureMeta {
  id: string;
  title: string;
  priority: string;
  acMethods: readonly string[];
  /** Per-AC metadata including expected test levels from @Expects decorators. */
  acDetails: readonly ACMeta[];
  enabled: boolean;
  className: string;
  file: string;
  /** Requirement class names from @Satisfies(...) decorator, empty if absent. */
  satisfies: readonly string[];
}

export interface FileCov {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
  /** Total instrumentable lines. 0 → file is type-only (no executable code). */
  linesTotal?: number;
  /** Total instrumentable statements. 0 alongside linesTotal=0 confirms type-only. */
  statementsTotal?: number;
}

export type RuntimeStatus = 'ok' | 'partial' | 'missing' | 'undeclared' | 'disabled';

export interface RuntimeCoverage {
  status: RuntimeStatus;
  declared: number;
  found: number;
  missing: readonly string[];
  minLinesPct: number | null;
}

export function parseFeatureSource(src: string, file: string): FeatureMeta | null {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);

  for (const stmt of sf.statements) {
    if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
    const mods = stmt.modifiers ?? [];
    const isAbstract = mods.some(m => m.kind === ts.SyntaxKind.AbstractKeyword);
    const isExported = mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isAbstract || !isExported) continue;

    const extendsFeature = stmt.heritageClauses?.some(h =>
      h.token === ts.SyntaxKind.ExtendsKeyword &&
      h.types.some(t => ts.isIdentifier(t.expression) && t.expression.text === 'Feature'),
    );
    if (!extendsFeature) continue;

    const className = stmt.name.text;
    let id = className;
    let title = className;
    let priority = 'medium';
    let enabled = true;
    const acMethods: string[] = [];
    const acDetails: ACMeta[] = [];
    const satisfies = readClassRefDecorator(stmt, 'Satisfies');

    for (const member of stmt.members) {
      if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name) && member.initializer) {
        const key = member.name.text;
        const init = unwrapAsExpression(member.initializer);

        if (key === 'id' && ts.isStringLiteral(init)) id = init.text;
        else if (key === 'title' && ts.isStringLiteral(init)) title = init.text;
        else if (key === 'priority' && ts.isPropertyAccessExpression(init)) {
          priority = init.name.text.toLowerCase();
        } else if (key === 'enabled' && init.kind === ts.SyntaxKind.FalseKeyword) {
          enabled = false;
        }
      } else if (
        ts.isMethodDeclaration(member) &&
        ts.isIdentifier(member.name) &&
        (member.modifiers ?? []).some(m => m.kind === ts.SyntaxKind.AbstractKeyword)
      ) {
        const acName = member.name.text;
        acMethods.push(acName);
        const levels = readExpectsDecorator(member);
        acDetails.push({ name: acName, expectedLevels: levels });
      }
    }

    return { id, title, priority, acMethods, acDetails, enabled, className, file, satisfies };
  }

  return null;
}

/** Map TestLevel enum member names to their string values. Single source of truth. */
const LEVEL_NAME_TO_VALUE = {
  Unit:                 'unit',
  Functional:           'functional',
  EndToEnd:             'e2e',
  Accessibility:        'a11y',
  Internationalization: 'i18n',
  Visual:               'visual',
  Performance:          'perf',
  Smoke:                'smoke',
  Integration:          'integration',
} as const satisfies Record<string, TestLevel>;

const VALID_LEVELS: ReadonlySet<TestLevel> = new Set(Object.values(LEVEL_NAME_TO_VALUE));

/**
 * Read @Expects(TestLevel.X, TestLevel.Y) decorator on an abstract method.
 * Returns the declared test levels, or ['unit'] as default.
 */
function readExpectsDecorator(member: ts.MethodDeclaration): TestLevel[] {
  // ts.canHaveDecorators is structurally true for MethodDeclaration — skip the redundant check.
  const decorators = ts.getDecorators(member);
  for (const dec of decorators ?? []) {
    if (!ts.isCallExpression(dec.expression)) continue;
    const callee = dec.expression.expression;
    if (!ts.isIdentifier(callee) || callee.text !== 'Expects') continue;
    const levels: TestLevel[] = [];
    for (const arg of dec.expression.arguments) {
      // Handles TestLevel.Unit → PropertyAccessExpression with name 'Unit'
      if (ts.isPropertyAccessExpression(arg)) {
        const key = arg.name.text;
        if (key in LEVEL_NAME_TO_VALUE) {
          levels.push(LEVEL_NAME_TO_VALUE[key as keyof typeof LEVEL_NAME_TO_VALUE]);
        }
      }
      // Handles string literal 'unit' directly
      if (ts.isStringLiteral(arg) && (VALID_LEVELS as ReadonlySet<string>).has(arg.text)) {
        levels.push(arg.text as TestLevel);
      }
    }
    if (levels.length > 0) return levels;
  }
  // The source generator uses trailing comments on abstract methods, where
  // TypeScript does not permit runtime method decorators. Read that same
  // representation so JSON -> TS -> compliance preserves e2e/functional levels.
  const source = member.getSourceFile().text;
  const trailingLine = source.slice(member.end).split(/\r?\n/, 1)[0]!;
  const match = /^\s*\/\/\s*expects:\s*([a-zA-Z0-9 ,]+)/.exec(trailingLine);
  const levels = (match?.[1]?.split(',').map(s => s.trim()) ?? [])
    .filter((level): level is TestLevel => (VALID_LEVELS as ReadonlySet<string>).has(level));
  return levels.length ? levels : ['unit'];
}

/**
 * Read a class decorator taking class references, e.g. `@Satisfies(A, B)` or
 * `@Refines(Parent)`. Returns the referenced class names as they appear in
 * source, or [] when the decorator is absent.
 */
function readClassRefDecorator(stmt: ts.ClassDeclaration, name: string): readonly string[] {
  const decorators = ts.getDecorators(stmt);
  if (!decorators) return [];
  for (const dec of decorators) {
    if (!ts.isCallExpression(dec.expression)) continue;
    const callee = dec.expression.expression;
    if (!ts.isIdentifier(callee) || callee.text !== name) continue;
    const names: string[] = [];
    for (const arg of dec.expression.arguments) {
      if (ts.isIdentifier(arg)) names.push(arg.text);
    }
    return names;
  }
  return [];
}

function unwrapAsExpression(node: ts.Expression): ts.Expression {
  while (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    node = node.expression;
  }
  return node;
}

/**
 * Walks `featuresDir` recursively, parsing every `.ts` file as a candidate
 * Feature. Subdirectory names are prepended to the returned `file` field so
 * the scanner can group features by section without losing the identifier.
 */
export async function readFeatures(featuresDir: string): Promise<FeatureMeta[]> {
  const collected: FeatureMeta[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const work = entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const src = await readFile(full, 'utf8');
        const parsed = parseFeatureSource(src, rel);
        if (parsed) collected.push(parsed);
      }
    });
    await Promise.all(work);
  };
  await walk(featuresDir, '');
  return collected;
}

export interface RequirementMeta {
  id: string;
  className: string;
  file: string;
  /** Workflow state from `readonly status = '…'`; empty when the literal is not statically readable. */
  status: string;
  /** Parent Requirement class names from the `@Refines(...)` decorator, empty if absent. */
  refines: readonly string[];
}

/**
 * Minimal AST parse to extract (className, id) from a Requirement source file.
 * Used to resolve @Satisfies(ClassName) arguments to REQ-IDs for the compliance table.
 */
export function parseRequirementSource(src: string, file: string): RequirementMeta | null {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
  for (const stmt of sf.statements) {
    if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
    const mods = stmt.modifiers ?? [];
    const isAbstract = mods.some(m => m.kind === ts.SyntaxKind.AbstractKeyword);
    const isExported = mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isAbstract || !isExported) continue;

    const extendsRequirement = stmt.heritageClauses?.some(h =>
      h.token === ts.SyntaxKind.ExtendsKeyword &&
      h.types.some(t => {
        const exp = t.expression;
        return ts.isIdentifier(exp) && exp.text === 'Requirement';
      }),
    );
    if (!extendsRequirement) continue;

    const className = stmt.name.text;
    let id = className;
    let status = '';
    for (const member of stmt.members) {
      if (
        !ts.isPropertyDeclaration(member) ||
        !ts.isIdentifier(member.name) ||
        !member.initializer
      ) continue;
      const init = unwrapAsExpression(member.initializer);
      if (!ts.isStringLiteral(init)) continue;
      if (member.name.text === 'id') id = init.text;
      else if (member.name.text === 'status') status = init.text;
    }
    return { id, className, file, status, refines: readClassRefDecorator(stmt, 'Refines') };
  }
  return null;
}

export async function readRequirements(requirementsDir: string): Promise<RequirementMeta[]> {
  const collected: RequirementMeta[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    const work = entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const src = await readFile(full, 'utf8');
        const parsed = parseRequirementSource(src, rel);
        if (parsed) collected.push(parsed);
      }
    });
    await Promise.all(work);
  };
  await walk(requirementsDir, '');
  return collected;
}

/** Feature projection the strict gates consume — id plus resolved Requirement links. */
export interface TraceabilityFeature {
  readonly id: string;
  readonly satisfies: readonly string[];
}

/** Requirement projection the strict gates consume — id, workflow status, parents. */
export interface TraceabilityRequirement {
  readonly id: string;
  readonly status: string;
  /** REQ-IDs this Requirement refines, so coverage can flow up a decomposition. */
  readonly refines: readonly string[];
}

export interface TraceabilityCorpus {
  readonly features: readonly TraceabilityFeature[];
  readonly requirements: readonly TraceabilityRequirement[];
}

/**
 * Project TypeScript-parsed metas onto the shape the `--strict` gates read,
 * resolving every `@Satisfies(ClassName)` argument to its REQ-ID.
 *
 * This is the source-of-truth bridge for projects that declare their
 * traceability in `.ts` classes rather than in sidecar `*.spec.json` files:
 * without it the gates see an empty corpus and pass vacuously.
 *
 * Class names with no Requirement in `requirementsDir` are kept verbatim — the
 * link exists (the Feature is not an orphan) even when the Requirement is
 * declared in another package. `@Refines` parents are resolved the same way.
 */
export function deriveTraceabilityCorpus(
  features: readonly FeatureMeta[],
  requirements: readonly RequirementMeta[],
): TraceabilityCorpus {
  const classToId = new Map(requirements.map(r => [r.className, r.id]));
  const resolve = (className: string): string => classToId.get(className) ?? className;
  return {
    features: features.map(f => ({
      id: f.id,
      satisfies: f.satisfies.map(resolve),
    })),
    requirements: requirements.map(r => ({
      id: r.id,
      status: r.status,
      refines: r.refines.map(resolve),
    })),
  };
}

export function normalizeCoveragePath(absOrRel: string, root: string): string {
  // Reports can originate on the other supported platform. The host's path
  // implementation must not interpret a Windows drive as a relative POSIX name.
  const paths = /^(?:[a-z]:[\\/]|\\\\)/i.test(absOrRel) ? path.win32 : path.posix;
  const normalized = paths.isAbsolute(absOrRel) ? paths.relative(root, absOrRel) : absOrRel;
  return normalized.replace(/\\/g, '/');
}

export interface CoverageLocation {
  file: string;
  runId: string;
}

export async function findLatestCoverageSummary(root: string, runId?: string): Promise<CoverageLocation | null> {
  const testResultsDir = path.join(root, 'test-results');

  // If a specific runId is requested, look only there
  if (runId) {
    const runPath = path.join(testResultsDir, runId);
    for (const sub of ['coverage/coverage-summary.json', 'unit/coverage/coverage-summary.json']) {
      const candidate = path.join(runPath, sub);
      try {
        await stat(candidate);
        return { file: candidate, runId };
      } catch {
        // missing — try next
      }
    }
    return null;
  }

  // Otherwise scan all runs and pick the most recent ISO-timestamped run
  const ISO_RUN_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;
  let runDirs: string[];
  try {
    runDirs = (await readdir(testResultsDir)).filter(d => ISO_RUN_RE.test(d));
  } catch {
    return null;
  }

  const candidates: { file: string; runId: string }[] = [];
  await Promise.all(
    runDirs.map(async run => {
      const runPath = path.join(testResultsDir, run);
      for (const sub of ['coverage/coverage-summary.json', 'unit/coverage/coverage-summary.json']) {
        const candidate = path.join(runPath, sub);
        try {
          await stat(candidate);
          candidates.push({ file: candidate, runId: run });
        } catch {
          // missing — skip
        }
      }
    }),
  );

  if (candidates.length === 0) return null;
  // ISO timestamps sort lexicographically — most recent first
  candidates.sort((a, b) => b.runId.localeCompare(a.runId));
  return { file: candidates[0]!.file, runId: candidates[0]!.runId };
}

export async function loadCoverageSummary(
  summaryPath: string,
  root: string,
): Promise<Map<string, FileCov>> {
  const raw = await readFile(summaryPath, 'utf8');
  const json = JSON.parse(raw) as Record<string, RawSummaryEntry>;
  const out = new Map<string, FileCov>();

  for (const [key, entry] of Object.entries(json)) {
    if (key === 'total') continue;
    const rel = normalizeCoveragePath(key, root);
    out.set(rel, {
      lines: entry.lines.pct,
      branches: entry.branches.pct,
      functions: entry.functions.pct,
      statements: entry.statements.pct,
      linesTotal: entry.lines.total,
      statementsTotal: entry.statements.total,
    });
  }

  return out;
}

interface RawSummaryEntry {
  lines: { pct: number; total: number };
  branches: { pct: number; total: number };
  functions: { pct: number; total: number };
  statements: { pct: number; total: number };
}

export function computeRuntimeCoverage(
  sourceFiles: readonly string[],
  coverage: Map<string, FileCov> | null,
  enabled = true,
): RuntimeCoverage {
  if (!enabled) {
    return { status: 'disabled', declared: sourceFiles.length, found: 0, missing: [], minLinesPct: null };
  }
  if (sourceFiles.length === 0) {
    return { status: 'ok', declared: 0, found: 0, missing: [], minLinesPct: null };
  }
  if (!coverage) {
    return {
      status: 'missing',
      declared: sourceFiles.length,
      found: 0,
      missing: [...sourceFiles],
      minLinesPct: null,
    };
  }

  const missing: string[] = [];
  const foundPcts: number[] = [];
  for (const src of sourceFiles) {
    const entry = coverage.get(src);
    if (!entry) missing.push(src);
    else foundPcts.push(entry.lines);
  }

  const found = foundPcts.length;
  const minLinesPct = found > 0 ? Math.min(...foundPcts) : null;

  let status: RuntimeStatus;
  if (found === 0) status = 'missing';
  else if (missing.length > 0) status = 'partial';
  else status = 'ok';

  return { status, declared: sourceFiles.length, found, missing, minLinesPct };
}

export interface OrphanFile {
  file: string;
  linesPct: number;
}

export function findOrphanSourceFiles(
  features: readonly FeatureMeta[],
  coverage: Map<string, FileCov>,
  derivedByFeatureId: Map<string, readonly string[]>,
): OrphanFile[] {
  const claimed = new Set<string>();
  for (const f of features) {
    const files = derivedByFeatureId.get(f.id) ?? [];
    for (const src of files) claimed.add(src);
  }

  const orphans: OrphanFile[] = [];
  for (const [file, cov] of coverage) {
    if (claimed.has(file)) continue;
    // Type-only files (interfaces, type aliases, ambient declarations) emit no
    // runtime code and cannot be feature-claimed via test imports. v8 reports
    // them with both totals at 0 — exempt them from orphan detection.
    if (cov.linesTotal === 0 && cov.statementsTotal === 0) continue;
    orphans.push({ file, linesPct: cov.lines });
  }
  orphans.sort((a, b) => a.file.localeCompare(b.file));
  return orphans;
}
