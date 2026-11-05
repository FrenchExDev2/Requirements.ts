/**
 * Test-smells — AST-level detection of declarative ↔ behavior gaps in
 * `@FeatureTest` / `@Verifies` test methods.
 *
 * This module is honest: it does NOT claim to verify "the test does what it
 * says". It detects three specific, observable problems at the AST level:
 *
 *   1. `empty-targets`  — body touches no `src/` symbol (per the bindings scanner)
 *   2. `empty-body`     — body is missing, `{}`, or just a bare `return;`
 *   3. `no-assertion`   — body has no `expect(...)` / `assert(...)` invocation
 *
 * Real behavioral grounding requires mutation testing — see the companion
 * `behavioral-check` module. This module is the fast first-pass gate.
 */

import * as ts from 'typescript';
import * as path from 'path';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import {
  parseTestFile,
  extractFeatureTestArg,
  extractVerifiesArgs,
  getRootIdentifier,
  collectTestFiles,
  collectLocalHelpers,
  collectClassHelpers,
  hasTypeCheckOnlyDecorator,
} from '@frenchexdev2/requirements-scanner';

export type TestSmellKind = 'empty-targets' | 'empty-body' | 'no-assertion';

export interface TestSmell {
  readonly kind: TestSmellKind;
  readonly file: string;
  readonly className: string;
  readonly methodName: string;
  readonly featureClass: string;
  readonly ac: string;
}

/**
 * Roots recognised as assertions. Kept narrow on purpose — false negatives are
 * fine (a custom helper that ultimately calls expect() won't be flagged because
 * the test almost always uses expect() somewhere), false positives erode trust
 * faster than missed smells.
 *
 *   - expect / assert  → vitest, node:assert, chai
 *   - fc               → fast-check (`fc.assert(fc.property(...))`, `fc.check`)
 */

const ASSERTION_ROOTS = new Set(['expect', 'assert', 'fc']);

export function detectTestSmells(
  src: string,
  file: string,
  root: string,
): TestSmell[] {
  const parsed = parseTestFile(src, file, root);
  
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
  const localHelpers = collectLocalHelpers(sf);
  const smells: TestSmell[] = [];

  for (const stmt of sf.statements) {
    
    if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
    const featureClass = extractFeatureTestArg(stmt);
    if (!featureClass) continue;
    const className = stmt.name.text;
    const parsedClass = parsed.classes.find(c => c.className === className);
    const classHelpers = collectClassHelpers(stmt);

    for (const member of stmt.members) {
      
      if (!ts.isMethodDeclaration(member)) continue;
      const methodName = readMemberName(member.name);
      
      /* Coverage rationale:  -- defensive: readMemberName returns null only for computed names, already v8-ignored */
      if (!methodName) continue;
      const verifiesArgs = extractVerifiesArgs(member);
      if (verifiesArgs.length === 0) continue;
      const isTypeCheckOnly = hasTypeCheckOnlyDecorator(member);

      for (const ac of verifiesArgs) {
        const base = { file, className, methodName, featureClass, ac };
        const binding = parsedClass?.methods.find(
          m => m.methodName === methodName && m.ac === ac,
        );

        // `empty-targets` is intentional on @TypeCheckOnly() tests.
        // Body-level smells (`empty-body`, `no-assertion`) still apply —
        // a type-check test must still compile and prove something at runtime.
        if (!isTypeCheckOnly && binding && binding.targets.length === 0) {
          smells.push({ kind: 'empty-targets', ...base });
        }

        if (isEmptyBody(member.body)) {
          smells.push({ kind: 'empty-body', ...base });
        } else if (!bodyHasAssertion(member.body!, localHelpers, classHelpers)) {
          smells.push({ kind: 'no-assertion', ...base });
        }
      }
    }
  }
  return smells;
}

function readMemberName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : /* Coverage rationale:  -- defensive: test methods never use computed / numeric property names */ null;
}

function isEmptyBody(body: ts.Block | undefined): boolean {
  
  if (!body) return true;
  if (body.statements.length === 0) return true;
  
  if (body.statements.length === 1) {
    const s = body.statements[0]!;
    if (ts.isReturnStatement(s) && !s.expression) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Orchestrator — FileSystem-port driven walk over test directories
// ────────────────────────────────────────────────────────────────────────────

export interface TestSmellsScanOptions {
  readonly testDirs: readonly string[];
  readonly root: string;
  readonly fs: FileSystem;
}

export interface TestSmellsScanResult {
  readonly smells: readonly TestSmell[];
  readonly fileCount: number;
  readonly warnings: readonly string[];
}

export async function scanTestSmells(opts: TestSmellsScanOptions): Promise<TestSmellsScanResult> {
  const files: string[] = [];
  for (const dir of opts.testDirs) {
    const abs = path.isAbsolute(dir) ? dir : path.join(opts.root, dir);
    files.push(...(await collectTestFiles(opts.fs, abs)));
  }

  const smells: TestSmell[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    let src: string;
    try {
      
      src = await opts.fs.readFile(file, 'utf8');
    } catch (err) {
      warnings.push(`failed to read ${file}: ${(err as Error).message}`);
      continue;
    }
    smells.push(...detectTestSmells(src, file, opts.root));
  }

  return { smells, fileCount: files.length, warnings };
}

/**
 * Returns true if `body` (or any helper it transitively calls) contains a
 * CallExpression whose root identifier is an assertion (expect / assert / fc).
 * Helpers are tracked across the test file and the enclosing class only —
 * imported helpers from other modules are NOT followed (they would require a
 * full TypeScript program and are unlikely to mask a smell anyway).
 *
 * Cycle protection: a helper is walked at most once.
 */
function bodyHasAssertion(
  body: ts.Block,
  localHelpers: ReadonlyMap<string, ts.Node>,
  classHelpers: ReadonlyMap<string, ts.Node>,
): boolean {
  const visited = new Set<string>();
  const walk = (node: ts.Node): boolean => {
    let found = false;
    const visit = (n: ts.Node): void => {
      
      if (found) return;
      if (ts.isCallExpression(n)) {
        const rootName = getRootIdentifier(n.expression);
        if (rootName && ASSERTION_ROOTS.has(rootName)) {
          found = true;
          return;
        }
        const helperKey = resolveHelperKey(n.expression);
        
        if (helperKey && !visited.has(helperKey)) {
          visited.add(helperKey);
          const helper = localHelpers.get(helperKey) ?? classHelpers.get(helperKey);
          if (helper && walk(helper)) {
            found = true;
            return;
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  };
  return walk(body);
}

/**
 * Pick the right name to look up in helper maps:
 *   - `this.helper()`   → 'helper' (class method lookup)
 *   - `helper()`        → 'helper' (local function lookup, via getRootIdentifier)
 *   - `chai.expect(x)`  → 'chai'   (which won't match any helper — harmless)
 */
function resolveHelperKey(expr: ts.Expression): string | null {
  
  if (ts.isPropertyAccessExpression(expr) && expr.expression.kind === ts.SyntaxKind.ThisKeyword) {
    return expr.name.text;
  }
  return getRootIdentifier(expr);
}
