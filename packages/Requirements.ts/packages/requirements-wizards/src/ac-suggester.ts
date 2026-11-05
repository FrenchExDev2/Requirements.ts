/**
 * Deterministic AC name suggester — zero-LLM heuristic for the Feature wizard.
 *
 * Given a Feature title like "adds items to cart", returns 3-5 camelCase AC
 * name candidates mined from the repo corpus of existing `abstract acName():
 * ACResult` declarations on real `Feature` subclasses. No network, no RNG,
 * no Date.now().
 *
 * Corpus parsing is AST-based (ts-morph, in-memory project) rather than regex:
 *  - Multi-line method signatures parse correctly.
 *  - Only classes whose heritage clause is `Feature` contribute ACs (new
 *    heritage shapes plug in at `isFeatureClass` without touching callers — OCP).
 *  - Only abstract methods whose return-type text is `ACResult` are accepted,
 *    filtering out helper `abstract` declarations.
 *
 * Algorithm (preserved verbatim from the regex version)
 *  1. Enumerate `.ts` files under `featuresDir` via the injected FileSystem.
 *  2. AST-parse each file; collect AC method names from Feature subclasses.
 *  3. Tokenise each AC into [verb, ...nouns] by splitting camelCase.
 *  4. Build a verb-frequency map.
 *  5. Tokenise the Feature title: split on non-alphanum, drop stop-words,
 *     lowercase → title noun set.
 *  6. Score each AC name:
 *
 *        score(N) = 2 * verbFrequency(verb(N))  +  |nouns(N) ∩ titleNouns|
 *
 *     Higher is better; pure function of (title, corpus).
 *  7. Sort score desc, lexicographic asc for tie-breaks.
 *  8. Filter via AC_NAME_PATTERN + smart constructor.
 *  9. Return up to 5; gracefully degrade if corpus is empty or undersized.
 *
 * SOLID
 *   S — parseCorpusAcs parses, rankCandidates ranks, suggestAcNames composes.
 *   O — parser extensibility via isFeatureClass / isAcMethod predicates.
 *   D — depends on ts-morph AST and the FileSystem port, never on raw fs.
 */

import { Project } from 'ts-morph';
import type { ClassDeclaration, MethodDeclaration, SourceFile } from 'ts-morph';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import { AC_NAME_PATTERN, acName, type AcName } from '@frenchexdev2/requirements-core/types';

/** Ultra-small stop-word list — common English fillers that are never nouns. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'by',
  'with', 'from', 'as', 'is', 'are', 'be', 'it', 'its', 'that', 'this',
  'at', 'into', 'onto', 'via',
]);

/** Minimum / maximum number of candidates the suggester returns. */
export const SUGGESTER_MIN = 3;
export const SUGGESTER_MAX = 5;

/** The return-type text required for a method to be treated as an AC. */
const AC_RETURN_TYPE = 'ACResult';

/**
 * Suggest 3-5 AC names for a Feature title, mined deterministically from the
 * repo corpus. Pure apart from the injected FileSystem port.
 */
export async function suggestAcNames(
  title: string,
  fs: FileSystem,
  featuresDir: string,
): Promise<readonly AcName[]> {
  const corpus = await parseCorpusAcs(fs, featuresDir);
  return rankCandidates(title, corpus);
}

// ══════════════════════════════════════════════════════════════════════════════
// Corpus parsing — ts-morph AST, in-memory project
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Read every `.ts` file in `featuresDir` through the FileSystem port and
 * collect every abstract AC method name declared on a `Feature` subclass.
 * Returns the raw string identifiers (not yet branded nor filtered).
 */
export async function parseCorpusAcs(
  fs: FileSystem,
  featuresDir: string,
): Promise<readonly string[]> {
  const dirExists = await fs.exists(featuresDir);
  if (!dirExists) return [];
  const entries = await fs.readdir(featuresDir);
  const files = entries
    .filter((f) => f.endsWith('.ts'))
    .slice()
    .sort(); // deterministic ordering regardless of FS
  if (files.length === 0) return [];

  const project = new Project({ useInMemoryFileSystem: true });
  const names: string[] = [];
  for (const file of files) {
    const path = joinPath(featuresDir, file);
    const src = await fs.readFile(path, 'utf8');
    const sf = project.createSourceFile(path, src, { overwrite: true });
    for (const name of extractAcMethodNames(sf)) {
      names.push(name);
    }
  }
  return names;
}

/** Extract AC names from a single parsed source file. */
function extractAcMethodNames(sf: SourceFile): readonly string[] {
  const out: string[] = [];
  for (const cls of sf.getClasses()) {
    if (!isFeatureClass(cls)) continue;
    for (const m of cls.getMethods()) {
      if (!isAcMethod(m)) continue;
      out.push(m.getName());
    }
  }
  return out;
}

/**
 * A class is a Feature contributor iff its `extends` clause resolves to the
 * textual identifier `Feature`. This is an OCP seam — future subclass shapes
 * (e.g. `Feature<SomeStyle>`) plug in here without touching callers.
 */
function isFeatureClass(cls: ClassDeclaration): boolean {
  const ext = cls.getExtends();
  if (!ext) return false;
  const exprText = ext.getExpression().getText();
  return exprText === 'Feature';
}

/**
 * A method is an AC iff it is abstract and its return type is textually
 * `ACResult`. Methods with no declared return type or a different return
 * type are ignored (defensive against helper `abstract` declarations).
 */
function isAcMethod(m: MethodDeclaration): boolean {
  if (!m.isAbstract()) return false;
  const rt = m.getReturnTypeNode();
  if (!rt) return false;
  return rt.getText() === AC_RETURN_TYPE;
}

// ══════════════════════════════════════════════════════════════════════════════
// Ranking — pure, deterministic, FS-free
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Score every corpus name against the title and return the top 3–5 candidates.
 * Pure function of (title, corpus); safe to call without a filesystem.
 */
export function rankCandidates(
  title: string,
  corpus: readonly string[],
): readonly AcName[] {
  const valid = corpus.filter((n) => AC_NAME_PATTERN.test(n));
  if (valid.length === 0) return [];

  const titleNouns = extractTitleNouns(title);
  // AC_NAME_PATTERN guarantees at least one lowercase letter, so tokeniseCamel
  // always yields a non-empty token list — no defensive undefined branch needed.
  const tokensByName = new Map<string, readonly string[]>();
  const verbFreq = new Map<string, number>();
  for (const name of valid) {
    const tokens = tokeniseCamel(name);
    tokensByName.set(name, tokens);
    const verb = tokens[0]!;
    verbFreq.set(verb, (verbFreq.get(verb) ?? 0) + 1);
  }

  type Scored = { readonly name: string; readonly score: number };
  const scored: Scored[] = valid.map((name) => {
    const tokens = tokensByName.get(name)!;
    const verb = tokens[0]!;
    const nouns = tokens.slice(1).map((t) => t.toLowerCase());
    const overlap = nouns.filter((n) => titleNouns.has(n)).length;
    const score = 2 * verbFreq.get(verb)! + overlap;
    return { name, score };
  });

  // Deterministic sort: score desc, then lexicographic asc for stable ties.
  scored.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));

  // De-dup while preserving order.
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const s of scored) {
    if (!seen.has(s.name)) {
      seen.add(s.name);
      ordered.push(s.name);
    }
  }

  // Take top N; ensure min via corpus size, cap at max.
  const target = Math.min(SUGGESTER_MAX, ordered.length);
  const desired = Math.max(SUGGESTER_MIN, Math.min(SUGGESTER_MAX, target));
  const top = ordered.slice(0, desired);

  // Smart-constructor pass — defence-in-depth over AC_NAME_PATTERN.
  const branded: AcName[] = [];
  for (const name of top) {
    try {
      branded.push(acName(name));
    } catch {
      // skip: AC_NAME_PATTERN already filters these, belt-and-braces.
    }
  }
  return branded;
}

/** Extract the set of lowercase noun tokens from a Feature title. */
export function extractTitleNouns(title: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const raw of title.split(/[^A-Za-z0-9]+/)) {
    if (raw.length === 0) continue;
    const lower = raw.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    out.add(lower);
  }
  return out;
}

/**
 * Split a camelCase identifier into its lowercase tokens.
 * `addsItemToCart` → `['adds','item','to','cart']`.
 */
export function tokeniseCamel(name: string): readonly string[] {
  const parts: string[] = [];
  let buf = '';
  for (const ch of name) {
    if (ch >= 'A' && ch <= 'Z') {
      if (buf.length > 0) parts.push(buf);
      buf = ch.toLowerCase();
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) parts.push(buf);
  return parts;
}

/** Minimal POSIX-style path join; avoids pulling `node:path`. */
function joinPath(dir: string, file: string): string {
  if (dir.endsWith('/') || dir.endsWith('\\')) return dir + file;
  return `${dir}/${file}`;
}
