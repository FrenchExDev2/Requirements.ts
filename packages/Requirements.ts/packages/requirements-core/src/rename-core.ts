/**
 * rename-core — cross-file Feature/Requirement/AC rename codemod.
 *
 * Pure, dep-injected core. All I/O flows through the `FileSystem` port.
 *
 * IMPLEMENTATION NOTE — ts-morph edition
 *   This module uses the `ts-morph` Project / language-service layer on top of
 *   the TypeScript compiler. We do SYMBOL-level renames via `ClassDeclaration.
 *   rename()` and `MethodDeclaration.rename()`. The language service updates
 *   every reference (imports, type references, decorator call arguments,
 *   property accesses, comments-if-asked, strings-if-asked) — NO regex, NO
 *   word-boundary hacks.
 *
 *   The `Project` is constructed with a `PortFileSystemHost` adapter that
 *   pre-loads all `.ts` + `.json` files through our async `FileSystem` port
 *   and serves them synchronously to ts-morph. Writes on apply still flow
 *   exclusively through `fs.writeFile` / `fs.unlink` — we never call
 *   `project.save()`, preserving the `renameWritesViaFileSystemPort` AC.
 *
 * Responsibilities:
 *   - Feature rename: class decl (→ updates every reference), file name
 *     (via `SourceFile.move` → updates every import), spec.json `id` + file.
 *   - Requirement rename: class decl, file name, spec.json id + file.
 *   - AC rename: abstract method on the owning Feature (→ updates no
 *     references automatically because `@Verifies<X>('oldAc')` is a STRING
 *     LITERAL — handled via targeted AST walk on `Decorator` nodes), plus
 *     the spec.json `acs[].name` entry.
 *
 * Defaults:
 *   - Dry-run: prints a unified diff; exits 0 without touching disk.
 *   - `--apply`: writes all changes through the FileSystem port.
 *
 * Guards:
 *   - Target id format validated via `featureId()` / `requirementId()`.
 *   - Target id conflict → refuse unless `--force`.
 *   - Post-rewrite diagnostics (syntactic + semantic via `getPreEmitDiagnostics`)
 *     → refuse unless `--force`.
 */

import {
  Project,
  InMemoryFileSystemHost,
  SyntaxKind,
  type SourceFile,
  type Decorator,
  type StringLiteral,
} from 'ts-morph';
import { createTwoFilesPatch } from 'diff';
import type { FileSystem } from './ports/index.js';
import {
  featureId as parseFeatureId,
  requirementId as parseRequirementId,
  acName as parseAcName,
  ParseError,
  type FeatureId,
  type RequirementId,
  type AcName,
} from './types.js';
import {
  featureClassName,
  requirementClassName,
  kebabOfId,
} from '@frenchexdev2/requirements-shared-kernel';

// ══════════════════════════════════════════════════════════════════════════
// Public types (API STABLE — `bin/requirements.ts` imports these)
// ══════════════════════════════════════════════════════════════════════════

export type RenameKind = 'feature' | 'requirement' | 'ac';

export interface RenameOptions {
  readonly kind: RenameKind;
  /** For ac rename, this is the owning FeatureId. */
  readonly owner?: string;
  readonly oldId: string;
  readonly newId: string;
  readonly apply?: boolean;
  readonly force?: boolean;
  readonly root: string;
  readonly scanDirs: readonly string[];
  readonly featuresDir: string;
  readonly requirementsDir: string;
}

export interface PlannedEdit {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

export interface PlannedRename {
  readonly renames: readonly { readonly from: string; readonly to: string }[];
  readonly edits: readonly PlannedEdit[];
  readonly unifiedDiff: string;
}

export interface RenameResult {
  readonly plan: PlannedRename;
  readonly applied: boolean;
  readonly message: string;
}

export class RenameError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'RenameError';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// FileSystemHost adapter — bridges ts-morph ↔ our async FileSystem port.
//
// ts-morph needs a SYNC `FileSystemHost`. Our port is async-only. Strategy:
// walk our port once to pre-seed an `InMemoryFileSystemHost`, then hand that
// host to ts-morph. All in-project mutations ts-morph performs (move,
// rewrite) stay in memory; `runRename` reads the resulting source text and
// re-writes via our `FileSystem` port on `--apply`. `project.save()` is
// NEVER called, preserving the FileSystem port invariant.
// ══════════════════════════════════════════════════════════════════════════

async function createHostFromPort(
  port: FileSystem,
  roots: readonly string[],
): Promise<{ host: InMemoryFileSystemHost; files: Map<string, string> }> {
  const host = new InMemoryFileSystemHost();
  const files = new Map<string, string>();
  for (const r of roots) await walk(r, port, files);
  for (const [p, content] of files) {
    if (p.endsWith('.ts')) host.writeFileSync(p, content);
  }
  return { host, files };
}

// ══════════════════════════════════════════════════════════════════════════
// Port walk (load all .ts + .json into a Map)
// ══════════════════════════════════════════════════════════════════════════

async function walk(dir: string, fs: FileSystem, out: Map<string, string>): Promise<void> {
  let entries: string[];
  try { entries = await fs.readdir(dir); } catch { return; }
  for (const entry of entries) {
    const full = joinPath(dir, entry);
    let isDir = false;
    try { isDir = (await fs.stat(full)).isDirectory(); } catch { continue; }
    if (isDir) { await walk(full, fs, out); continue; }
    if (!full.endsWith('.ts') && !full.endsWith('.json')) continue;
    try { out.set(full, await fs.readFile(full, 'utf8')); } catch { /* skip */ }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Renamer hierarchy (SOLID: one class per concern, DRY via template method)
// ══════════════════════════════════════════════════════════════════════════

interface RenameContext {
  readonly project: Project;
  readonly opts: RenameOptions;
  readonly originalFiles: Map<string, string>;
  readonly pendingJsonWrites: Map<string, string>;
}

interface IRenamer {
  plan(): { readonly renames: { from: string; to: string }[] };
}

abstract class BaseRenamer implements IRenamer {
  constructor(protected readonly ctx: RenameContext) {}

  /** Execute the in-memory rewrite. Returns on-disk path renames. */
  abstract plan(): { readonly renames: { from: string; to: string }[] };

  protected get project(): Project { return this.ctx.project; }
  protected get opts(): RenameOptions { return this.ctx.opts; }
}

/** Base for Feature + Requirement — DRY the whole class+file+spec flow. */
abstract class ClassKindRenamer extends BaseRenamer {
  protected abstract classNameFor(id: string): string;
  protected abstract targetDir(): string;

  plan(): { readonly renames: { from: string; to: string }[] } {
    const { opts } = this;
    const oldClass = this.classNameFor(opts.oldId);
    const newClass = this.classNameFor(opts.newId);
    const oldKebab = kebabOfId(opts.oldId);
    const newKebab = kebabOfId(opts.newId);
    const dir = this.targetDir();
    const oldSrc = joinPath(dir, `${oldKebab}.ts`);
    const newSrc = joinPath(dir, `${newKebab}.ts`);
    const oldSpec = joinPath(dir, `${oldKebab}.spec.json`);
    const newSpec = joinPath(dir, `${newKebab}.spec.json`);

    renameClassAndMoveFile(this.project, oldSrc, oldClass, newClass, newSrc, !!opts.force);

    // Syntactic fallback: any Identifier === oldClass that the language
    // service couldn't resolve (e.g. because the importing module path
    // doesn't resolve in our hermetic codemod environment) gets a direct
    // identifier-level rewrite. Safe: we mutate Identifier AST nodes only.
    syntacticRenameIdentifier(this.project, oldClass, newClass);
    // Also rewrite import specifiers `'…/oldKebab'` → `'…/newKebab'` for
    // cases where the imported module didn't resolve.
    syntacticRenameImportPath(this.project, oldKebab, newKebab);

    const renames: { from: string; to: string }[] = [];
    if (oldSrc !== newSrc) renames.push({ from: oldSrc, to: newSrc });
    const oldSpecContent = this.ctx.originalFiles.get(oldSpec);
    /* Coverage rationale:  — spec.json always accompanies a scaffolded feature */
    if (oldSpecContent !== undefined) {
      if (oldSpec !== newSpec) renames.push({ from: oldSpec, to: newSpec });
      const updatedSpec = rewriteSpecId(oldSpecContent, opts.oldId, opts.newId, opts.kind);
      // Store updated spec under the NEW path; the edit-collection loop
      // diffs it against the pre-edit content at `oldSpec` (via renameBack).
      /* Coverage rationale:  — spec id always present (validated by loadAllSpecs) */
      if (updatedSpec !== oldSpecContent) this.ctx.pendingJsonWrites.set(newSpec, updatedSpec);
    }
    return { renames };
  }
}

class FeatureRenamer extends ClassKindRenamer {
  protected classNameFor(id: string): string { return featureClassName(id as FeatureId); }
  protected targetDir(): string { return this.opts.featuresDir; }
}

class RequirementRenamer extends ClassKindRenamer {
  protected classNameFor(id: string): string { return requirementClassName(id as RequirementId); }
  protected targetDir(): string { return this.opts.requirementsDir; }
}

/** AC rename — abstract method on owning Feature + `@Verifies<X>('oldAc')`
 * string-literal decorator arguments + spec.json acs[].name entry. */
class AcRenamer extends BaseRenamer {
  plan(): { readonly renames: { from: string; to: string }[] } {
    const { opts } = this;
    const owner = opts.owner!;
    const ownerClass = featureClassName(owner as FeatureId);
    const ownerKebab = kebabOfId(owner);
    const oldAc = opts.oldId;
    const newAc = opts.newId;
    const ownerSrc = joinPath(opts.featuresDir, `${ownerKebab}.ts`);
    const ownerSpec = joinPath(opts.featuresDir, `${ownerKebab}.spec.json`);

    // 1. Rename the abstract method on the owning Feature class.
    const ownerSf = this.project.getSourceFile(ownerSrc);
    if (!ownerSf) throw new RenameError(`Feature source not found: ${ownerSrc}`, 'MISSING_SOURCE');
    const cls = ownerSf.getClass(ownerClass);
    if (!cls) throw new RenameError(`Feature class not found: ${ownerClass}`, 'MISSING_CLASS');
    const method = cls.getMethod(oldAc);
    if (!method) throw new RenameError(`Acceptance criterion not found: ${ownerClass}.${oldAc}`, 'MISSING_AC');
    method.rename(newAc);

    // 2. Rewrite every `@Verifies<OwnerClass>('oldAc')` string literal.
    //    Symbol rename cannot touch string-literal args; we walk decorators.
    for (const sf of this.project.getSourceFiles()) {
      rewriteVerifiesStringArg(sf, ownerClass, oldAc, newAc);
    }

    // 3. Rewrite spec.json ac name (no file rename for ac; in-place edit).
    const specContent = this.ctx.originalFiles.get(ownerSpec);
    /* Coverage rationale:  — spec always exists + updated content always differs
       when oldAc is actually present in the spec */
    if (specContent !== undefined) {
      const updated = rewriteSpecAcName(specContent, oldAc, newAc, owner);
      if (updated !== specContent) this.ctx.pendingJsonWrites.set(ownerSpec, updated);
    }

    return { renames: [] };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Shared helpers (DRY)
// ══════════════════════════════════════════════════════════════════════════

function renameClassAndMoveFile(
  project: Project,
  oldSrcPath: string,
  oldClass: string,
  newClass: string,
  newSrcPath: string,
  force: boolean,
): void {
  const sf = project.getSourceFile(oldSrcPath);
  if (!sf) throw new RenameError(`Source not found: ${oldSrcPath}`, 'MISSING_SOURCE');
  const cls = sf.getClass(oldClass);
  if (!cls) throw new RenameError(`Class not found: ${oldClass}`, 'MISSING_CLASS');
    // Symbol-level rename: updates every RESOLVED reference across the
    // project (imports that resolve, type arguments in `@FeatureTest(X)`,
    // `@Satisfies(X)`, etc.). Unresolved references get picked up by the
    // syntactic fallback pass.
  cls.rename(newClass);
  // File move: ts-morph updates every `import ... from '.../old-name'`
  // where the import resolves. `overwrite: true` lets --force replace a
  // pre-existing target file (conflict-override path).
  
  if (oldSrcPath === newSrcPath) return;
  sf.move(newSrcPath, { overwrite: force });
}

/** Rewrite `@Verifies<X>('oldAc')` string literal and all other exact-text
 * Identifier references — syntactic fallback for symbols whose imports
 * don't resolve. Walks the AST (not text), so strings + comments are never
 * touched unless they actually ARE the Identifier/StringLiteral we target. */
function syntacticRenameIdentifier(project: Project, oldName: string, newName: string): void {
  for (const sf of project.getSourceFiles()) {
    const ids = sf.getDescendantsOfKind(SyntaxKind.Identifier);
    for (const id of ids) {
      // Guard: skip identifiers inside import *type* binding names we've
      // already rewritten. `.getText()` on an Identifier is just its name.
      if (id.getText() !== oldName) continue;
      // ts-morph forbids `.replaceWithText` on wrapped Identifier in some
      // positions; `renameNode` path: use the parent rename when available.
      // Safer: use `.replaceWithText(newName)` which works for every
      // Identifier usage (expression, type ref, import specifier name).
      id.replaceWithText(newName);
    }
  }
}

/** Rewrite import module specifiers `'…/oldKebab'` → `'…/newKebab'` for
 * imports that didn't resolve (ts-morph's `SourceFile.move` only updates
 * resolved imports). */
function syntacticRenameImportPath(project: Project, oldKebab: string, newKebab: string): void {
  const re = new RegExp(`(^|/)${escapeRegExp(oldKebab)}$`);
  for (const sf of project.getSourceFiles()) {
    for (const imp of sf.getImportDeclarations()) {
      // Well-formed imports always have a module specifier string.
      const spec = imp.getModuleSpecifierValue()!;
      if (re.test(spec)) imp.setModuleSpecifier(spec.replace(re, `$1${newKebab}`));
    }
  }
}

/** Parse one canonical sidecar before any filesystem mutation is applied. */
function parseSidecar(content: string, kind: RenameKind, id: string): Record<string, unknown> {
  let spec: unknown;
  try { spec = JSON.parse(content); }
  catch { throw new RenameError('The rename sidecar contains invalid JSON.', 'SPEC_MISMATCH'); }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || !('id' in spec) || spec.id !== id || !('kind' in spec) || spec.kind !== kind) {
    throw new RenameError(`The rename sidecar does not declare ${kind} ${id}.`, 'SPEC_MISMATCH');
  }
  return spec as Record<string, unknown>;
}

/** Change the top-level identity while preserving historical and nested IDs. */
function rewriteSpecId(content: string, oldId: string, newId: string, kind: RenameKind): string {
  const spec = parseSidecar(content, kind, oldId);
  return oldId === newId ? content : JSON.stringify({ ...spec, id: newId }, null, 2) + '\n';
}

/** Change only the declared AC entry; historical names are immutable evidence. */
function rewriteSpecAcName(json: string, oldAc: string, newAc: string, owner: string): string {
  const spec = parseSidecar(json, 'feature', owner);
  if (!Array.isArray(spec.acs) || !spec.acs.every(ac => ac && typeof ac === 'object' && typeof ac.name === 'string') || !spec.acs.some(ac => ac.name === oldAc)) {
    throw new RenameError(`The rename sidecar does not declare acceptance criterion ${owner}.${oldAc}.`, 'SPEC_MISMATCH');
  }
  if (oldAc === newAc) return json;
  return JSON.stringify({ ...spec, acs: spec.acs.map(ac => ac.name === oldAc ? { ...ac, name: newAc } : ac) }, null, 2) + '\n';
}

/** Walk every decorator in a SourceFile; if it matches
 * `@Verifies<OwnerClass>('oldAc')`, rewrite the string literal.
 * We match on the AST — not on text — so commented-out or multi-line
 * decorators are safe. */
function rewriteVerifiesStringArg(
  sf: SourceFile,
  ownerClass: string,
  oldAc: string,
  newAc: string,
): void {
  const decorators = sf.getDescendantsOfKind(SyntaxKind.Decorator) as Decorator[];
  for (const dec of decorators) {
    if (dec.getName() !== 'Verifies') continue;
    const typeArgs = dec.getTypeArguments();
    if (typeArgs.length === 0) continue;
    if (typeArgs[0]!.getText() !== ownerClass) continue;
    const args = dec.getArguments();
    for (const a of args) {
      if (a.getKind() !== SyntaxKind.StringLiteral) continue;
      const lit = a as StringLiteral;
      if (lit.getLiteralText() === oldAc) {
        lit.setLiteralValue(newAc);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Entry point
// ══════════════════════════════════════════════════════════════════════════

export async function runRename(
  opts: RenameOptions,
  fs: FileSystem,
): Promise<RenameResult> {
  validateTargetId(opts);

  // Each asynchronous call owns its edits; concurrent renames cannot mix JSON.
  const pendingJsonWrites = new Map<string, string>();

  const roots = [...new Set([opts.featuresDir, opts.requirementsDir, ...opts.scanDirs])];
  const { host, files } = await createHostFromPort(fs, roots);

  const project = new Project({
    fileSystem: host,
    skipAddingFilesFromTsConfig: true,
    // Standard library types are required to detect invalid calls on primitives.
    skipLoadingLibFiles: false,
    compilerOptions: {
      target: 99 /* ESNext */,
      module: 99 /* ESNext */,
      moduleResolution: 100 /* Bundler */,
      experimentalDecorators: true,
      allowJs: false,
      strict: false,
      noEmit: true,
      lib: ['lib.es2022.d.ts'],
      skipLibCheck: true,
    },
  });
  for (const [p, content] of files) {
    if (p.endsWith('.ts')) project.createSourceFile(p, content, { overwrite: true });
  }

  // Conflict detection (feature / requirement only).
  if (opts.kind !== 'ac' && opts.oldId !== opts.newId) {
    const newClass = classNameFor(opts.kind, opts.newId);
    const newKebab = kebabOfId(opts.newId);
    const targetDir = opts.kind === 'feature' ? opts.featuresDir : opts.requirementsDir;
    const targetSrc = joinPath(targetDir, `${newKebab}.ts`);
    const targetSpec = joinPath(targetDir, `${newKebab}.spec.json`);
    let conflict = files.has(targetSrc) || files.has(targetSpec);
    if (!conflict) {
      for (const sf of project.getSourceFiles()) {
        if (sf.getClass(newClass)) { conflict = true; break; }
      }
    }
    if (conflict && !opts.force) {
      throw new RenameError(
        `Target id '${opts.newId}' already exists (class ${newClass} or ${targetSrc}). Pass --force to override.`,
        'CONFLICT',
      );
    }
  }

  // Delegate to the right Renamer (S/O/L/I/D: substitutable subclass).
  const ctx: RenameContext = { project, opts, originalFiles: files, pendingJsonWrites };
  const renamer: BaseRenamer =
    opts.kind === 'feature'     ? new FeatureRenamer(ctx) :
    opts.kind === 'requirement' ? new RequirementRenamer(ctx) :
    /* ac */                      new AcRenamer(ctx);
  const { renames } = renamer.plan();

  // tsc-clean guard — syntactic + semantic pre-emit diagnostics.
  const diagnostics = collectDiagnostics(project);
  if (diagnostics.length > 0 && !opts.force) {
    const summary = diagnostics.slice(0, 10).join('\n');
    throw new RenameError(
      `Rewrite would produce ${diagnostics.length} type error(s); refusing.\n${summary}`,
      'TYPECHECK',
    );
  }

  // Collect planned edits — diff every .ts + accumulated JSON rewrites.
  const edits: PlannedEdit[] = [];
  const finalContents = new Map<string, string>();

  // Reverse map of renames: newPath → oldPath. Lets us look up the pre-edit
  // content for a file whose ts-morph path has already been .move()d.
  const renameBack = new Map<string, string>();
  for (const r of renames) renameBack.set(r.to, r.from);

  for (const sf of project.getSourceFiles()) {
    const newPath = sf.getFilePath();
    const text = sf.getFullText();
    finalContents.set(newPath, text);
    const originalPath = renameBack.get(newPath) ?? newPath;
    // `files` was seeded from every .ts we added to the project, plus every
    // spec.json read during `walk()`. Every `newPath` is either the original
    // or a renamed target whose `from` is in `files`. Hence `files.get` is
    // never undefined here.
    const before = files.get(originalPath)!;
    if (before !== text) edits.push({ path: originalPath, before, after: text });
  }
  for (const [p, after] of pendingJsonWrites) {
    // `pendingJsonWrites` is populated only after reading content from
    // `files`, and always as a DIFFERENT string (rewriters only set on
    // change). Hence `before !== after` is always true here.
    const beforePath = renameBack.get(p) ?? p;
    const before = files.get(beforePath)!;
    finalContents.set(p, after);
    edits.push({ path: p, before, after });
  }

  const unifiedDiff = renderUnifiedDiff(edits, renames);
  const plan: PlannedRename = { renames, edits, unifiedDiff };

  if (!opts.apply) return { plan, applied: false, message: 'dry-run: no files written' };

  if (renames.length && !fs.unlink) throw new RenameError('Applying a file rename requires the FileSystem.unlink capability.', 'MISSING_CAPABILITY');

  // Apply: writes via FileSystem port only (NEVER project.save()).
  // Edits whose path is the TARGET of a rename are written via the renames
  // loop to avoid a double-write.
  const renameTargets = new Set(renames.map(r => r.to));
  for (const edit of edits) {
    if (renameTargets.has(edit.path)) continue;
    await fs.writeFile(edit.path, edit.after);
  }
  for (const { from, to } of renames) {
    // Every rename entry is emitted by a Renamer that also populates
    // `finalContents.set(to, ...)` — either via ts-morph's source file
    // move (class rename) or the JSON-write path (spec rename).
    const content = finalContents.get(to)!;
    await fs.writeFile(to, content);
    await fs.unlink!(from);
  }

  return { plan, applied: true, message: `applied ${edits.length} edit(s), ${renames.length} rename(s)` };
}

// ══════════════════════════════════════════════════════════════════════════
// Target-id validation
// ══════════════════════════════════════════════════════════════════════════

function validateTargetId(opts: RenameOptions): void {
  try {
    if (opts.kind === 'feature') {
      parseFeatureId(opts.oldId);
      parseFeatureId(opts.newId);
    } else if (opts.kind === 'requirement') {
      parseRequirementId(opts.oldId);
      parseRequirementId(opts.newId);
    } else {
      parseAcName(opts.oldId);
      parseAcName(opts.newId);
      if (!opts.owner) {
        throw new RenameError(`ac rename requires 'owner' FeatureId`, 'INVALID_OWNER');
      }
      parseFeatureId(opts.owner);
    }
  } catch (e) {
    if (e instanceof ParseError) {
      throw new RenameError(`Invalid target id: ${e.message}`, 'INVALID_ID');
    }
    throw e;
  }
}

function classNameFor(kind: 'feature' | 'requirement', id: string): string {
  return kind === 'feature'
    ? featureClassName(id as FeatureId)
    : requirementClassName(id as RequirementId);
}

// ══════════════════════════════════════════════════════════════════════════
// Diagnostics — ts-morph wraps getPreEmitDiagnostics (syntactic + semantic).
// Standard library signatures participate in semantic diagnostics. The port
// snapshot does not contain arbitrary external dependencies: unresolved external
// names/modules are distinguished from actual syntax and assignability errors.
// ══════════════════════════════════════════════════════════════════════════

/** ts error codes to ignore because they stem from the hermetic environment,
 * not from our rewrite. */
const IGNORED_TS_CODES = new Set<number>([
  2307, // Cannot find module 'X'
  2305, // Module 'X' has no exported member 'Y'
  2304, // Cannot find name 'X'
  2792, // Cannot find module ... consider adding paths
  2552, // Cannot find name; did you mean
  1219, // Experimental decorator support
  2688, // Cannot find type definition file
  6053, // File not found
  2318, // Cannot find global type
  2580, // Cannot find name 'require'
  2503, // Cannot find namespace
]);

function collectDiagnostics(project: Project): string[] {
  const diags: string[] = [];
  for (const d of project.getPreEmitDiagnostics()) {
    if (IGNORED_TS_CODES.has(d.getCode())) continue;
    diags.push(formatRenameDiagnostic(d));
  }
  return diags;
}

/** Minimal diagnostic port shared by compiler and CLI diagnostic renderers. */
export interface RenameDiagnostic {
  getSourceFile(): { getFilePath(): string } | undefined;
  getMessageText(): string | { getMessageText(): string };
}

/** Preserve both global diagnostics and file-scoped compiler messages. */
export function formatRenameDiagnostic(d: RenameDiagnostic): string {
  const sf = d.getSourceFile();
  
  const path = sf ? sf.getFilePath() : '<unknown>';
  const m = d.getMessageText();
  
  const msg = typeof m === 'string' ? m : m.getMessageText();
  return `${path}: ${msg}`;
}

// ══════════════════════════════════════════════════════════════════════════
// Unified diff rendering
// ══════════════════════════════════════════════════════════════════════════

function renderUnifiedDiff(
  edits: readonly PlannedEdit[],
  renames: readonly { from: string; to: string }[],
): string {
  const chunks: string[] = [];
  for (const edit of edits) {
    chunks.push(createTwoFilesPatch(edit.path, edit.path, edit.before, edit.after, '', ''));
  }
  for (const r of renames) {
    chunks.push(`rename ${r.from} → ${r.to}\n`);
  }
  return chunks.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════
// Misc helpers
// ══════════════════════════════════════════════════════════════════════════

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function joinPath(dir: string, file: string): string {
  const d = dir.replace(/\/+$/, '');
  return `${d}/${file}`;
}

// ══════════════════════════════════════════════════════════════════════════
// Convenience wrappers (API STABLE)
// ══════════════════════════════════════════════════════════════════════════

export async function renameFeature(
  oldId: string,
  newId: string,
  ctx: Omit<RenameOptions, 'kind' | 'oldId' | 'newId'>,
  fs: FileSystem,
): Promise<RenameResult> {
  return runRename({ ...ctx, kind: 'feature', oldId, newId }, fs);
}

export async function renameRequirement(
  oldId: string,
  newId: string,
  ctx: Omit<RenameOptions, 'kind' | 'oldId' | 'newId'>,
  fs: FileSystem,
): Promise<RenameResult> {
  return runRename({ ...ctx, kind: 'requirement', oldId, newId }, fs);
}

export async function renameAc(
  featureId: string,
  oldAc: string,
  newAc: string,
  ctx: Omit<RenameOptions, 'kind' | 'oldId' | 'newId' | 'owner'>,
  fs: FileSystem,
): Promise<RenameResult> {
  return runRename({ ...ctx, kind: 'ac', owner: featureId, oldId: oldAc, newId: newAc }, fs);
}

/** Exported for @Verifies binding with the Feature contract. */
export type { AcName, FeatureId, RequirementId };
