import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureHeuristicSuggesterFeature } from '@frenchexdev2/requirements-requirements';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import {
  suggestAcNames,
  rankCandidates,
  parseCorpusAcs,
  extractTitleNouns,
  tokeniseCamel,
  SUGGESTER_MIN,
  SUGGESTER_MAX,
} from '../../src/ac-suggester';
import { AC_NAME_PATTERN } from '@frenchexdev2/requirements-core/types';

// ── Tiny in-memory FileSystem mock — only the methods the suggester uses ───

interface FsState {
  readonly files: Record<string, string>;
  readonly dirs: ReadonlySet<string>;
  readdirCalls: string[];
  readFileCalls: string[];
}

function mkFs(files: Record<string, string>, dirs: readonly string[] = []): { fs: FileSystem; state: FsState } {
  const state: FsState = {
    files,
    dirs: new Set(dirs),
    readdirCalls: [],
    readFileCalls: [],
  };
  const fs: FileSystem = {
    async readFile(p) {
      state.readFileCalls.push(p);
      const v = files[p];
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    async writeFile() { throw new Error('not used'); },
    async exists(p) {
      return state.dirs.has(p) || Object.prototype.hasOwnProperty.call(files, p);
    },
    async mkdir() { /* no-op */ },
    async readdir(p) {
      state.readdirCalls.push(p);
      if (!state.dirs.has(p)) throw new Error(`ENOTDIR: ${p}`);
      const prefix = p.endsWith('/') ? p : p + '/';
      return Object.keys(files)
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.slice(prefix.length))
        .filter((f) => !f.includes('/'));
    },
    async stat() { throw new Error('not used'); },
  };
  return { fs, state };
}

const FEAT_DIR = '/repo/requirements/features';

/**
 * A plausible corpus covering multiple verbs and repeating patterns.
 * Every class `extends Feature`, every AC method returns `ACResult` — the
 * ts-morph parser recognises these and nothing else. The `helperThing()`
 * method on CartFeature is `abstract` but returns `void`, so it must be
 * ignored by the AST parser.
 */
const CORPUS_FILES: Record<string, string> = {
  [`${FEAT_DIR}/feat-cart.ts`]: `
    export abstract class CartFeature extends Feature {
      abstract addsItemToCart(): ACResult;
      abstract removesItemFromCart(): ACResult;
      abstract emptyCartShowsMessage(): ACResult;
      abstract helperThing(): void;  // not an AC — return type isn't ACResult
    }
  `,
  [`${FEAT_DIR}/feat-checkout.ts`]: `
    export abstract class CheckoutFeature extends Feature {
      abstract addsDiscount(): ACResult;
      abstract rejectsInvalidCoupon(): ACResult;
      abstract validatesCardNumber(): ACResult;
    }
  `,
  [`${FEAT_DIR}/feat-misc.ts`]: `
    export abstract class MiscFeature extends Feature {
      abstract addsNote(): ACResult;
      abstract rejectsDuplicate(): ACResult;
    }
    // Non-Feature class with an abstract ACResult method — must be ignored.
    export abstract class NotAFeature {
      abstract mustBeIgnored(): ACResult;
    }
  `,
  [`${FEAT_DIR}/README.md`]: `not a ts file — should be ignored`,
};

// ── Positive path ──────────────────────────────────────────────────────────

@FeatureTest(FeatureHeuristicSuggesterFeature)
class SuggesterPositiveTests {
  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterReturnsPlausibleNames')
  async 'returns plausible AC names for a known domain'() {
    const { fs } = mkFs(CORPUS_FILES, [FEAT_DIR]);
    const result = await suggestAcNames('adds item to cart', fs, FEAT_DIR);
    expect(result.length).toBeGreaterThanOrEqual(SUGGESTER_MIN);
    expect(result.length).toBeLessThanOrEqual(SUGGESTER_MAX);
    for (const s of result) expect(AC_NAME_PATTERN.test(s)).toBe(true);
    // Top candidate must use most-frequent verb ('adds' — 3x) + noun overlap.
    expect(result[0]!.startsWith('adds')).toBe(true);
    const rankItem = result.indexOf('addsItemToCart' as typeof result[number]);
    const rankNote = result.indexOf('addsNote' as typeof result[number]);
    expect(rankItem).toBeGreaterThanOrEqual(0);
    expect(rankItem).toBeLessThan(rankNote === -1 ? Number.MAX_SAFE_INTEGER : rankNote);
  }

  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterIsDeterministicAndOffline')
  async 'same input produces the same output, no network / clock dep'() {
    const { fs } = mkFs(CORPUS_FILES, [FEAT_DIR]);
    const a = await suggestAcNames('rejects invalid coupon', fs, FEAT_DIR);
    const b = await suggestAcNames('rejects invalid coupon', fs, FEAT_DIR);
    const c = await suggestAcNames('rejects invalid coupon', fs, FEAT_DIR);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  }

  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterRanksByDocumentedScore')
  'score = 2*verbFreq + nounOverlap; ties break lexicographically'() {
    const corpus = [
      'addsItemToCart',       // verb 'adds' (×3) + overlap 'cart' → 2*3 + 1 = 7
      'addsNote',             // verb 'adds' (×3) + overlap 0       → 2*3 + 0 = 6
      'addsDiscount',         // verb 'adds' (×3) + overlap 0       → 2*3 + 0 = 6
      'removesItemFromCart',  // verb 'removes' (×1) + overlap 'cart' → 2 + 1 = 3
      'rejectsInvalidCoupon', // verb 'rejects' (×1) + overlap 0 → 2
    ];
    const out = rankCandidates('items in cart', corpus);
    expect(out.slice(0, 5)).toEqual([
      'addsItemToCart',
      'addsDiscount', // tie with addsNote → lex order ('d' < 'n')
      'addsNote',
      'removesItemFromCart',
      'rejectsInvalidCoupon',
    ]);
  }

  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterReturnsBetweenThreeAndFiveCandidates')
  async 'trims to 5 max and pads up to 3 min'() {
    const { fs: fsLarge } = mkFs(CORPUS_FILES, [FEAT_DIR]);
    const large = await suggestAcNames('cart', fsLarge, FEAT_DIR);
    expect(large).toHaveLength(SUGGESTER_MAX);

    const small = rankCandidates('anything', ['alpha', 'beta', 'gamma']);
    expect(small).toHaveLength(SUGGESTER_MIN);

    const four = rankCandidates('x', ['alpha', 'beta', 'gamma', 'delta']);
    expect(four).toHaveLength(4);

    const tiny = rankCandidates('x', ['alpha', 'beta']);
    expect(tiny.length).toBe(2);
  }
}

// ── Error / validation paths ───────────────────────────────────────────────

@FeatureTest(FeatureHeuristicSuggesterFeature)
class SuggesterErrorTests {
  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterDegradesGracefullyOnEmptyCorpus')
  async 'empty corpus → empty array, no throw'() {
    const { fs: fs1 } = mkFs({}, [FEAT_DIR]);
    const a = await suggestAcNames('anything at all', fs1, FEAT_DIR);
    expect(a).toEqual([]);

    // Missing dir (exists → false) must also degrade gracefully.
    const { fs: fs2 } = mkFs({}, []);
    const b = await suggestAcNames('anything', fs2, '/nope');
    expect(b).toEqual([]);

    // Feature dir present but with zero .ts files → empty.
    const { fs: fs3 } = mkFs({ [`${FEAT_DIR}/README.md`]: 'doc' }, [FEAT_DIR]);
    const c = await suggestAcNames('x', fs3, FEAT_DIR);
    expect(c).toEqual([]);

    // Purely invalid-name corpus degrades to empty too.
    expect(rankCandidates('x', ['BadName', '9notAllowed', ''])).toEqual([]);
  }

  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterRejectsInvalidCamelCaseCandidates')
  async 'non-camelCase names and non-Feature classes are filtered out'() {
    // Corpus mixing: a valid Feature + AC, a BadName AC (would fail pattern),
    // a non-Feature class (must be filtered at parse time), and a non-abstract
    // method on a Feature (must also be skipped).
    const dir = '/r/feat';
    const files = {
      [`${dir}/a.ts`]: `
        export abstract class OkFeature extends Feature {
          abstract goodName(): ACResult;
          abstract BadName(): ACResult;
          concreteMethod(): ACResult { return undefined as unknown as ACResult; }
          abstract untypedAbstract();
        }
        export abstract class StrangerClass {
          abstract mustNotAppear(): ACResult;
        }
      `,
    };
    const { fs } = mkFs(files, [dir]);
    const parsed = await parseCorpusAcs(fs, dir);
    // Parser keeps only abstract + ACResult on Feature subclass, regardless
    // of whether the identifier itself is camelCase.
    expect([...parsed].sort()).toEqual(['BadName', 'goodName']);

    const ranked = rankCandidates('anything', parsed);
    for (const r of ranked) {
      expect(AC_NAME_PATTERN.test(r)).toBe(true);
      expect(r).not.toBe('BadName');
    }
    expect(AC_NAME_PATTERN.test('BadName')).toBe(false);

    // End-to-end path: the public API filters the same way.
    const via = await suggestAcNames('anything', fs, dir);
    expect(via.every((n) => AC_NAME_PATTERN.test(n))).toBe(true);
    expect(via).not.toContain('mustNotAppear');
  }
}

// ── Integration ────────────────────────────────────────────────────────────

@FeatureTest(FeatureHeuristicSuggesterFeature)
class SuggesterIntegrationTests {
  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterReadsCorpusViaFileSystemPort')
  async 'all corpus reads go through the FileSystem port'() {
    const { fs, state } = mkFs(CORPUS_FILES, [FEAT_DIR]);
    await suggestAcNames('cart items', fs, FEAT_DIR);
    expect(state.readdirCalls).toEqual([FEAT_DIR]);
    const tsFiles = Object.keys(CORPUS_FILES).filter((p) => p.endsWith('.ts'));
    for (const f of tsFiles) {
      expect(state.readFileCalls).toContain(f);
    }
    expect(state.readFileCalls.every((p) => p.endsWith('.ts'))).toBe(true);
  }

  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterIsCalledFromWizardBeforeAcPrompt')
  'public signature is the pure function wired before the AC prompt in the wizard'() {
    expect(typeof suggestAcNames).toBe('function');
    expect(suggestAcNames.length).toBe(3); // (title, fs, featuresDir)
  }
}

// ── End-to-end ─────────────────────────────────────────────────────────────

@FeatureTest(FeatureHeuristicSuggesterFeature)
class SuggesterEndToEndTests {
  @Verifies<FeatureHeuristicSuggesterFeature>('endToEndWizardAcceptsSuggestionViaTab')
  async 'a suggestion can be Tab-accepted verbatim as a valid AcName'() {
    const { fs } = mkFs(CORPUS_FILES, [FEAT_DIR]);
    const suggestions = await suggestAcNames('rejects invalid cart', fs, FEAT_DIR);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(AC_NAME_PATTERN.test(s)).toBe(true);
      expect(s).toBe(s.trim());
    }
  }
}

// ── Internal helpers coverage (pure functions exported for testability) ────

@FeatureTest(FeatureHeuristicSuggesterFeature)
class SuggesterInternalsTests {
  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterRanksByDocumentedScore')
  'duplicate corpus entries are de-duplicated in the output'() {
    const out = rankCandidates('cart', ['addsItemToCart', 'addsItemToCart', 'removesItem', 'resets']);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(out.length);
  }

  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterIsDeterministicAndOffline')
  'tokeniseCamel splits camelCase into lowercase tokens'() {
    expect(tokeniseCamel('addsItemToCart')).toEqual(['adds', 'item', 'to', 'cart']);
    expect(tokeniseCamel('adds')).toEqual(['adds']);
    expect(tokeniseCamel('')).toEqual([]);
    expect(tokeniseCamel('ABC')).toEqual(['a', 'b', 'c']);
  }

  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterIsDeterministicAndOffline')
  'extractTitleNouns drops stop-words and lowercases'() {
    const s = extractTitleNouns('The Cart, and the Item!');
    expect(s.has('cart')).toBe(true);
    expect(s.has('item')).toBe(true);
    expect(s.has('the')).toBe(false);
    expect(s.has('and')).toBe(false);
    expect(extractTitleNouns('').size).toBe(0);
  }

  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterReadsCorpusViaFileSystemPort')
  async 'parseCorpusAcs handles multi-line signatures and ignores non-Feature classes'() {
    // Multi-line signature — the regex version would miss this; AST handles it.
    const dir = '/r/ml';
    const files = {
      [`${dir}/a.ts`]: `
        export abstract class FooFeature extends Feature {
          abstract addsOne(
            arg: string,
            other: number,
          ): ACResult;
        }
      `,
    };
    const { fs } = mkFs(files, [dir]);
    const names = await parseCorpusAcs(fs, dir);
    expect(names).toEqual(['addsOne']);
  }

  @Verifies<FeatureHeuristicSuggesterFeature>('acSuggesterReadsCorpusViaFileSystemPort')
  async 'featuresDir with trailing slash is handled'() {
    const dir = '/repo/f/';
    const { fs } = mkFs({
      [`${dir}a.ts`]: `
        export abstract class AFeature extends Feature {
          abstract addsOne(): ACResult;
        }
      `,
      [`${dir}b.ts`]: `
        export abstract class BFeature extends Feature {
          abstract addsTwo(): ACResult;
          abstract removesOne(): ACResult;
        }
      `,
    }, [dir]);
    const out = await suggestAcNames('one two', fs, dir);
    expect(out.length).toBeGreaterThanOrEqual(SUGGESTER_MIN - 1); // 3 names → returns 3
    expect(out.every((n) => AC_NAME_PATTERN.test(n))).toBe(true);
  }
}

void SuggesterPositiveTests;
void SuggesterErrorTests;
void SuggesterIntegrationTests;
void SuggesterEndToEndTests;
void SuggesterInternalsTests;
