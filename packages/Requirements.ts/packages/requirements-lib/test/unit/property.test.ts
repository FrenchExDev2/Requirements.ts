/**
 * Property + fuzzy tests for the pure surface of @frenchexdev2/requirements.
 *
 * Industrial / safety-critical adopters need confidence that no random or
 * adversarial input crashes the package. One @Verifies per AC on
 * PropertyTestingFeature — see requirements/features/property-testing.ts.
 */

import { expect } from 'vitest';
import * as fc from '../../../../test/support/qualification-fast-check.js';

import { FeatureTest, Verifies } from '../../src';
import { PropertyTestingFeature } from '@frenchexdev2/requirements-requirements';

import {
  REQUIREMENT_ID_PATTERN,
  FEATURE_ID_PATTERN,
  AC_NAME_PATTERN,
  ISO_DATE_PATTERN,
  ParseError,
  SCHEMA_VERSION,
  requirementId,
  featureId,
  acName,
  isoDate,
  sentence,
  percentage,
} from '@frenchexdev2/requirements-core/types';
import type { FeatureSpec, Spec } from '@frenchexdev2/requirements-core/types';
import {
  kebabOfId,
  featureClassName,
  requirementClassName,
  specToJson,
} from '@frenchexdev2/requirements-spec-io/spec-to-source';
import { diffSpecToDisk } from '@frenchexdev2/requirements-sync';
import { Priority } from '../../src';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';

// ── In-memory FileSystem mock (inline — no coupling to sync-core.test.ts) ───

function mkFs(initial: Record<string, string> = {}): FileSystem {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    async readFile(path: string, _enc: 'utf8') {
      const v = files.get(path);
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return v;
    },
    async writeFile(path: string, content: string) { files.set(path, content); },
    async exists(path: string) { return files.has(path); },
    async mkdir(_path: string, _opts?: { recursive?: boolean }) {},
    async readdir(_path: string) { return []; },
    async stat(_path: string) { return { mtimeMs: 0, isDirectory: () => false, size: 0 }; },
  };
}

function mkFsAllMissing(): FileSystem {
  return {
    async readFile(path: string, _enc: 'utf8') { throw new Error(`ENOENT: ${path}`); },
    async writeFile(_p: string, _c: string) {},
    async exists(_path: string) { return false; },
    async mkdir(_path: string, _opts?: { recursive?: boolean }) {},
    async readdir(_path: string) { return []; },
    async stat(_path: string) { return { mtimeMs: 0, isDirectory: () => false, size: 0 }; },
  };
}

// ── Minimal valid FeatureSpec factory ────────────────────────────────────────

function mkSpec(): FeatureSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: featureId('PROP-FIXTURE'),
    title: 'property test fixture',
    priority: Priority.High,
    acs: [
      { name: acName('first'),  expects: [] },
      { name: acName('second'), expects: [] },
    ],
  };
}

// Arbitrary that builds strings matching FEATURE_ID_PATTERN (also valid
// RequirementId when prefixed with REQ-).
const upperAlpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const upperAlnum = upperAlpha + '0123456789';

const featureIdArb = fc
  .tuple(
    fc.constantFrom(...upperAlpha.split('')),
    fc.array(fc.constantFrom(...upperAlnum.split('')), { minLength: 0, maxLength: 5 }),
    fc.array(
      fc.array(fc.constantFrom(...upperAlnum.split('')), { minLength: 1, maxLength: 4 }),
      { minLength: 0, maxLength: 3 },
    ),
  )
  .map(([head, tail, segments]) => {
    const first = head + tail.join('');
    const rest = segments.map(seg => seg.join('')).join('-');
    return rest.length > 0 ? `${first}-${rest}` : first;
  })
  .filter(s => FEATURE_ID_PATTERN.test(s));

const requirementIdArb = featureIdArb.map(s => `REQ-${s}`).filter(s => REQUIREMENT_ID_PATTERN.test(s));

// ── Smart constructors ──────────────────────────────────────────────────────

@FeatureTest(PropertyTestingFeature)
class SmartConstructorProperties {
  @Verifies<PropertyTestingFeature>('smartConstructorsAcceptIfAndOnlyIfRegexMatches')
  'accept iff pattern matches'() {
    const cases: ReadonlyArray<readonly [(s: string) => unknown, RegExp]> = [
      [requirementId, REQUIREMENT_ID_PATTERN],
      [featureId,     FEATURE_ID_PATTERN],
      [acName,        AC_NAME_PATTERN],
      [isoDate,       ISO_DATE_PATTERN],
    ];
    for (const [ctor, pattern] of cases) {
      fc.assert(fc.property(fc.string(), (s: string) => {
        const matches = pattern.test(s);
        let threw = false;
        try { ctor(s); } catch { threw = true; }
        expect(threw).toBe(!matches);
      }), { numRuns: 200 });
    }
  }

  @Verifies<PropertyTestingFeature>('smartConstructorsThrowParseErrorOnReject')
  'rejects are ParseError with field and value'() {
    const cases: ReadonlyArray<readonly [(s: string) => unknown, RegExp, string]> = [
      [requirementId, REQUIREMENT_ID_PATTERN, 'RequirementId'],
      [featureId,     FEATURE_ID_PATTERN,     'FeatureId'],
      [acName,        AC_NAME_PATTERN,        'AcName'],
      [isoDate,       ISO_DATE_PATTERN,       'IsoDate'],
    ];
    for (const [ctor, pattern, field] of cases) {
      fc.assert(fc.property(fc.string(), (s: string) => {
        if (pattern.test(s)) return;
        try {
          ctor(s);
          // Expected to throw.
          expect.fail(`expected ${field} to reject ${JSON.stringify(s)}`);
        } catch (e) {
          expect(e).toBeInstanceOf(ParseError);
          expect((e as ParseError).name).toBe('ParseError');
          expect((e as ParseError).field).toBe(field);
          expect((e as ParseError).value).toBe(s);
        }
      }), { numRuns: 200 });
    }
  }

  @Verifies<PropertyTestingFeature>('smartConstructorsNeverThrowOtherErrorTypes')
  'across the FULL input domain (fc.anything), only ParseError is thrown (or success)'() {
    // After hardening with runtime typeof guards in src/cli/types.ts, the smart
    // constructors must reject non-string / non-number inputs with ParseError
    // — never with a TypeError leaking from .trim() or RegExp.test(). This
    // protects callers that bypass TypeScript: JSON.parse outputs, REST handlers,
    // FFI, dynamic imports.
    const stringCtors: ReadonlyArray<readonly [string, (s: string) => unknown]> = [
      ['requirementId', requirementId],
      ['featureId',     featureId],
      ['acName',        acName],
      ['isoDate',       isoDate],
      ['sentence',      sentence],
    ];
    for (const [name, ctor] of stringCtors) {
      fc.assert(fc.property(fc.anything(), (input: unknown) => {
        try { ctor(input as string); } catch (e) {
          if (!(e instanceof ParseError)) {
            throw new Error(`${name} threw ${(e as Error)?.constructor?.name} on ${typeof input}: ${String(input)}`);
          }
        }
      }), { numRuns: 200 });
    }

    fc.assert(fc.property(fc.anything(), (input: unknown) => {
      try { percentage(input as number); } catch (e) {
        if (!(e instanceof ParseError)) {
          throw new Error(`percentage threw ${(e as Error)?.constructor?.name} on ${typeof input}: ${String(input)}`);
        }
      }
    }), { numRuns: 200 });
  }

  @Verifies<PropertyTestingFeature>('smartConstructorsNeverThrowOtherErrorTypes')
  'declared-domain baseline: string ctors over fc.string and percentage over fc.double'() {
    // Sanity baseline: under the declared input domain alone (the type-checker's
    // contract), only ParseError is thrown. The `fc.anything()` test above
    // generalises this across the FULL input space (post-guard hardening).
    const stringCtors: ReadonlyArray<(s: string) => unknown> = [
      requirementId, featureId, acName, isoDate, sentence,
    ];
    for (const ctor of stringCtors) {
      fc.assert(fc.property(fc.string(), (s: string) => {
        try { ctor(s); } catch (e) {
          if (!(e instanceof ParseError)) {
            throw new Error(`non-ParseError thrown on string: ${(e as Error)?.constructor?.name}`);
          }
        }
      }), { numRuns: 200 });
    }
    fc.assert(fc.property(
      fc.double({ noNaN: false, noDefaultInfinity: false }),
      (n: number) => {
        try { percentage(n); } catch (e) {
          if (!(e instanceof ParseError)) {
            throw new Error(`non-ParseError thrown on number: ${(e as Error)?.constructor?.name}`);
          }
        }
      },
    ), { numRuns: 200 });
  }
}

// ── Id helpers ──────────────────────────────────────────────────────────────

@FeatureTest(PropertyTestingFeature)
class IdHelperProperties {
  @Verifies<PropertyTestingFeature>('idHelpersAreIdempotentAndReversible')
  'kebabOfId idempotent; featureClassName deterministic'() {
    fc.assert(fc.property(featureIdArb, (id: string) => {
      const once = kebabOfId(id);
      const twice = kebabOfId(once);
      expect(twice).toBe(once);
      // Determinism: same input → same output, no side-effects.
      expect(featureClassName(id as never)).toBe(featureClassName(id as never));
      expect(requirementClassName(`REQ-${id}` as never)).toBe(requirementClassName(`REQ-${id}` as never));
    }));
  }

  @Verifies<PropertyTestingFeature>('kebabOfIdProducesLowercase')
  'kebabOfId is always lowercase'() {
    fc.assert(fc.property(featureIdArb, (id: string) => {
      const k = kebabOfId(id);
      expect(k.toLowerCase()).toBe(k);
    }));
  }

  @Verifies<PropertyTestingFeature>('featureClassNameAlwaysEndsWithFeature')
  'featureClassName ends with Feature'() {
    fc.assert(fc.property(featureIdArb, (id: string) => {
      expect(featureClassName(id as never).endsWith('Feature')).toBe(true);
    }));
  }

  @Verifies<PropertyTestingFeature>('requirementClassNameAlwaysEndsWithRequirement')
  'requirementClassName ends with Requirement'() {
    fc.assert(fc.property(requirementIdArb, (id: string) => {
      expect(requirementClassName(id as never).endsWith('Requirement')).toBe(true);
    }));
  }
}

// ── Sentence + Percentage ───────────────────────────────────────────────────

@FeatureTest(PropertyTestingFeature)
class SentenceAndPercentageProperties {
  @Verifies<PropertyTestingFeature>('sentenceAcceptsIffNonEmptyAndTerminated')
  'sentence accepts iff non-empty trim and terminal punct'() {
    fc.assert(fc.property(fc.string(), (s: string) => {
      const trimmed = s.trim();
      const shouldAccept = trimmed.length > 0 && /[.!?]$/.test(trimmed);
      let threw = false;
      try { sentence(s); } catch { threw = true; }
      expect(threw).toBe(!shouldAccept);
    }), { numRuns: 200 });
  }

  @Verifies<PropertyTestingFeature>('percentageAcceptsIffFiniteAnd0to100')
  'percentage accepts iff finite and in [0,100]'() {
    fc.assert(fc.property(
      fc.double({ noNaN: false, noDefaultInfinity: false }),
      (n: number) => {
        const shouldAccept = Number.isFinite(n) && n >= 0 && n <= 100;
        let threw = false;
        try { percentage(n); } catch { threw = true; }
        expect(threw).toBe(!shouldAccept);
      },
    ), { numRuns: 200 });
  }
}

// ── specToJson ──────────────────────────────────────────────────────────────

@FeatureTest(PropertyTestingFeature)
class SpecToJsonProperties {
  @Verifies<PropertyTestingFeature>('specToJsonIsDeterministicAndRoundtrips')
  'specToJson deterministic and JSON.parse roundtrip'() {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 40 }),
      fc.constantFrom(Priority.Low, Priority.Medium, Priority.High, Priority.Critical),
      (title: string, priority: Priority) => {
        const spec: Spec = { ...mkSpec(), title, priority };
        const once = specToJson(spec);
        const twice = specToJson(spec);
        expect(twice).toBe(once);                       // deterministic
        const parsed = JSON.parse(once);
        const reserialized = specToJson(parsed as Spec);
        expect(reserialized).toBe(once);                // round-trip stable
      },
    ));
  }

  @Verifies<PropertyTestingFeature>('specToJsonAlwaysHasSchemaVersionFirst')
  'JSON has $schema then $schemaVersion as first two keys'() {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 20 }),
      (title: string) => {
        const spec: Spec = { ...mkSpec(), title };
        const parsed = JSON.parse(specToJson(spec));
        const keys = Object.keys(parsed);
        expect(keys[0]).toBe('$schema');
        expect(keys[1]).toBe('$schemaVersion');
      },
    ));
  }
}

// ── validateSpec / validateStatement (DefaultStyle): moved to
//    @frenchexdev2/requirements-styles → DefaultStyleRobustnessFeature.

// ── diffSpecToDisk invariants ───────────────────────────────────────────────

@FeatureTest(PropertyTestingFeature)
class DiffAlgebraicProperties {
  @Verifies<PropertyTestingFeature>('diffOfEqualContentYieldsAllUnchanged')
  async 'proposed === current → all unchanged'() {
    await fc.assert(fc.asyncProperty(
      fc.dictionary(
        fc.stringMatching(/^requirements\/features\/[a-z]{1,8}\.ts$/),
        fc.string({ minLength: 0, maxLength: 80 }),
        { minKeys: 1, maxKeys: 4 },
      ),
      async (pathMap: Record<string, string>) => {
        const fs = mkFs(pathMap);
        const proposed = new Map(Object.entries(pathMap));
        const plan = await diffSpecToDisk(mkSpec(), proposed, fs);
        expect(plan.entries.length).toBe(proposed.size);
        for (const e of plan.entries) expect(e.status).toBe('unchanged');
      },
    ));
  }

  @Verifies<PropertyTestingFeature>('diffOfMissingCurrentYieldsAllCreate')
  async 'fs.exists()===false everywhere → all create'() {
    await fc.assert(fc.asyncProperty(
      fc.dictionary(
        fc.stringMatching(/^requirements\/features\/[a-z]{1,8}\.ts$/),
        fc.string({ minLength: 0, maxLength: 80 }),
        { minKeys: 1, maxKeys: 4 },
      ),
      async (pathMap: Record<string, string>) => {
        const fs = mkFsAllMissing();
        const proposed = new Map(Object.entries(pathMap));
        const plan = await diffSpecToDisk(mkSpec(), proposed, fs);
        expect(plan.entries.length).toBe(proposed.size);
        for (const e of plan.entries) {
          expect(e.status).toBe('create');
          expect(e.current).toBeNull();
        }
      },
    ));
  }
}

// ── Reporter robustness: moved to @frenchexdev2/requirements-styles.

void SmartConstructorProperties;
void IdHelperProperties;
void SentenceAndPercentageProperties;
void SpecToJsonProperties;
void DiffAlgebraicProperties;
