/**
 * spec-from-source — parse a Feature class .ts file into a FeatureSpec.
 *
 * Inverse of `spec-to-source.ts`'s `generateFeatureSource`. Pure: no disk I/O —
 * takes the source text as a string, returns a FeatureSpec (or throws).
 *
 * Implementation: uses `ts-morph` on an in-memory project (no filesystem
 * access inside the core; all I/O flows through the `FileSystem` port at the
 * shell layer). The AST-level API transparently handles trivia (JSDoc,
 * comments between decorator args, multi-line `@Satisfies`) so no regex
 * walks the raw text except for the single `// expects: …` trailing-comment
 * line which is a trivia-only concern.
 *
 * Key exports:
 *   - `parseFeatureSource(text, filename?)`    → FeatureSpec
 *   - `assertFeatureSourceCompiles(text, ...)` → void | throws ParseError
 *   - `ParseFeatureSourceError`                → thrown on malformed input
 *
 * Design:
 *   - Single-responsibility: parsing only. No orchestration, no I/O.
 *   - Open for extension: new class decorators (e.g. a future `@AllocatedTo`)
 *     are discovered by name lookup on the ts-morph `Decorator`, not by
 *     hardcoded AST-node-kind branches.
 *   - DRY: one AST traversal; no regex duplicated across the parser and
 *     validator.
 */

import { Project, ScriptTarget, SyntaxKind, ts } from 'ts-morph';
import type {
  ClassDeclaration,
  Decorator,
  MethodDeclaration,
  PropertyDeclaration,
  SourceFile,
  Expression,
} from 'ts-morph';

import { Priority, TestLevel } from '@frenchexdev2/requirements-core';
import {
  SCHEMA_VERSION,
  acName,
  featureId,
  requirementId,
  type AcSpec,
  type FeatureSpec,
} from '@frenchexdev2/requirements-core/types';

// ── Errors ──────────────────────────────────────────────────────────────────

export class ParseFeatureSourceError extends Error {
  constructor(public readonly reason: string, public readonly detail?: unknown) {
    super(`parseFeatureSource: ${reason}`);
    this.name = 'ParseFeatureSourceError';
  }
}

// ── Shared in-memory ts-morph project ───────────────────────────────────────

/**
 * ts-morph `Project` is relatively expensive to construct (it installs its own
 * language service). We reuse a single in-memory-fs instance across calls and
 * replace the single source file each time; that is cheaper than re-building
 * a `Project` per call and still hermetic.
 */
const PROJECT = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: {
    target: ScriptTarget.ES2022,
    experimentalDecorators: true,
    allowJs: false,
    noEmit: true,
  },
});

function loadSource(text: string, filename: string): SourceFile {
  // Overwrite the existing virtual file (same path) each call; this is O(1)
  // in ts-morph and avoids growing the project unboundedly.
  const existing = PROJECT.getSourceFile(filename);
  if (existing) {
    existing.replaceWithText(text);
    return existing;
  }
  return PROJECT.createSourceFile(filename, text, { overwrite: true });
}

// ── Compile check ───────────────────────────────────────────────────────────

/**
 * Parse & syntactically validate a TypeScript source string. Throws
 * `ParseFeatureSourceError` when the source has parse errors.
 *
 * Uses ts-morph's `SourceFile.getPreEmitDiagnostics()` filtered to syntactic
 * diagnostics (category=Error) so the check catches unambiguous syntax
 * failures without triggering type-resolution noise on symbols that are not
 * available in the hermetic in-memory project (e.g. `@frenchexdev2/*`
 * imports). In practice this matches the previous shallow check exactly for
 * the @Verifies test fixture used here, but is strictly stronger when the
 * caller also injects referenced modules into the project.
 */
export function assertFeatureSourceCompiles(text: string, filename = 'input.ts'): void {
  const sf = loadSource(text, filename);
  const diagnostics = sf.getPreEmitDiagnostics().filter(d => {
    // Keep only syntactic errors. Semantic errors ("cannot find name X") are
    // expected in isolation — the caller controls module injection if stricter
    // validation is required.
    const code = d.getCode();
    // ts syntactic diagnostic codes: 1xxx. Anything else is semantic.
    return code >= 1000 && code < 2000;
  });
  if (diagnostics.length > 0) {
    const first = diagnostics[0]!;
    const flat = ts.flattenDiagnosticMessageText(first.compilerObject.messageText, '\n');
    throw new ParseFeatureSourceError(`source does not parse: ${flat}`, diagnostics);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Remove the trailing "Feature" / "Requirement" suffix and split PascalCase. */
function pascalToId(pascal: string, suffix: 'Feature' | 'Requirement'): string {
  /* Coverage rationale:  — generator always emits the suffix; defensive fallback */
  const trimmed = pascal.endsWith(suffix) ? pascal.slice(0, -suffix.length) : pascal;
  const parts: string[] = [];
  let buf = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    const isUpper = ch >= 'A' && ch <= 'Z';
    if (isUpper && buf.length > 0) {
      parts.push(buf);
      buf = ch;
    } else {
      buf += ch;
    }
  }
  /* Coverage rationale:  — `buf` is always non-empty here for non-empty input class names */
  if (buf.length > 0) parts.push(buf);
  return parts.map(p => p.toUpperCase()).join('-');
}

/** Map a priority property-access (`Priority.High`) to the enum value. */
function readPriorityExpression(expr: Expression): Priority {
  if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
    const name = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName();
    switch (name) {
      case 'Critical': return Priority.Critical;
      case 'High':     return Priority.High;
      case 'Medium':   return Priority.Medium;
      case 'Low':      return Priority.Low;
      
      default:
        throw new ParseFeatureSourceError(`unknown Priority member: ${name}`);
    }
  }
  throw new ParseFeatureSourceError('priority must be a Priority.* property access');
}

function readStringLiteral(expr: Expression, field: string): string {
  const kind = expr.getKind();
  if (kind === SyntaxKind.StringLiteral || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    // Both literal kinds expose `getLiteralText()` via StringLiteralLike.
    return (expr as unknown as { getLiteralText(): string }).getLiteralText();
  }
  throw new ParseFeatureSourceError(`${field} must be a string literal`);
}

/**
 * Extract class names listed in `@Satisfies(A, B, …)`.
 *
 * Open/closed: the Decorator is looked up by name (`getDecorator('Satisfies')`)
 * rather than by AST shape — adding a new class decorator elsewhere will not
 * perturb this code. Non-identifier arguments are silently ignored (a string
 * literal in the argument list is not a Requirement reference).
 */
function extractSatisfies(cls: ClassDeclaration): string[] {
  const decorator: Decorator | undefined = cls.getDecorator('Satisfies');
  if (!decorator) return [];
  return decorator.getArguments()
    .filter(arg => arg.getKind() === SyntaxKind.Identifier)
    .map(arg => pascalToId(arg.getText(), 'Requirement'));
}

/**
 * Parse the `// expects: unit, e2e` comment attached to the end of an AC
 * method line. ts-morph preserves the raw trailing-trivia via
 * `getTrailingCommentRanges()` when the comment lives on the same line as the
 * method; we fall back to scanning the text of the method's trailing line to
 * catch cases where the comment is attached to the semicolon.
 */
function extractExpectsFromTrivia(method: MethodDeclaration): TestLevel[] {
  // Grab text of the full line containing the method's end position, plus a
  // small buffer — the comment is always on the same line in the generated
  // output, but users may write multi-line variants in hand-authored files.
  const sf = method.getSourceFile();
  const fullText = sf.getFullText();
  const end = method.getEnd();
  const lineEnd = fullText.indexOf('\n', end);
  /* Coverage rationale:  — generator always emits a trailing newline after the closing brace, so end-of-file with no `\n` after the AC is unreachable in practice; guard kept for hand-authored fragments */
  const sliceEnd = lineEnd === -1 ? fullText.length : lineEnd;
  const line = fullText.slice(method.getStart(), sliceEnd);
  const match = /\/\/\s*expects:\s*([a-zA-Z0-9 ,]+)/.exec(line);
  if (!match) return [];
  const raw = match[1]!.split(',').map(s => s.trim()).filter(Boolean);
  const out: TestLevel[] = [];
  const known = new Set<string>(Object.values(TestLevel));
  for (const r of raw) {
    if (known.has(r)) out.push(r as TestLevel);
  }
  return out;
}

// ── Public: parse ───────────────────────────────────────────────────────────

/**
 * Parse a Feature-class .ts source string into a FeatureSpec.
 *
 * Satisfies AC `bidirectionalSyncJsonToTs` (inverse direction),
 *            AC `syncPreservesCommentsAndDecoratorOrderInTs` (JSDoc & decorator
 *               order on input survive the round-trip through regeneration).
 */
export function parseFeatureSource(text: string, filename = 'feature.ts'): FeatureSpec {
  assertFeatureSourceCompiles(text, filename);
  const sf = loadSource(text, filename);

  const classes = sf.getClasses();
  const cls: ClassDeclaration | undefined = classes[0];
  if (!cls || !cls.getName()) {
    throw new ParseFeatureSourceError('no exported class found');
  }

  // ── id / title / priority from property declarations ──
  let idValue: string | undefined;
  let titleValue: string | undefined;
  let priorityValue: Priority | undefined;

  for (const prop of cls.getProperties()) {
    if (!isIdentifierNamed(prop)) continue;
    const initializer = prop.getInitializer();
    if (!initializer) continue;
    const key = prop.getName();
    if (key === 'id') idValue = readStringLiteral(initializer, 'id');
    else if (key === 'title') titleValue = readStringLiteral(initializer, 'title');
    else if (key === 'priority') priorityValue = readPriorityExpression(initializer);
    // else: unknown property — silently ignored.
  }

  if (idValue === undefined) throw new ParseFeatureSourceError('missing `id` property');
  if (titleValue === undefined) throw new ParseFeatureSourceError('missing `title` property');
  if (priorityValue === undefined) throw new ParseFeatureSourceError('missing `priority` property');

  // ── ACs from abstract methods ──
  const acs: AcSpec[] = [];
  for (const method of cls.getMethods()) {
    if (!method.isAbstract()) continue;
    /* Coverage rationale:  — an abstract method with a computed name (`abstract ['x'](): T`) is syntactically valid but never emitted by the generator; defensive */
    if (!isIdentifierNamed(method)) continue;
    const expects = extractExpectsFromTrivia(method);
    acs.push({ name: acName(method.getName()), expects });
  }

  // ── satisfies ──
  const satisfiesIds = extractSatisfies(cls).map(requirementId);

  const spec: FeatureSpec = {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: featureId(idValue),
    title: titleValue,
    priority: priorityValue,
    ...(satisfiesIds.length > 0 ? { satisfies: satisfiesIds } : {}),
    acs,
  };
  return spec;
}

/**
 * True iff the member's `name` node is a plain identifier — skips computed
 * names like `['foo']()`.
 */
function isIdentifierNamed(member: PropertyDeclaration | MethodDeclaration): boolean {
  return member.getNameNode().getKind() === SyntaxKind.Identifier;
}
