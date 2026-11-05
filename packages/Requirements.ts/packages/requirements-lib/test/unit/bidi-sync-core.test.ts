import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureBidirectionalSyncFeature } from '@frenchexdev2/requirements-requirements';
import {
  AmbiguousMergeError,
  SyncRefusedCompileError,
  contentHash,
  detectDivergence,
  jsonToTsSpec,
  syncBidirectional,
  threeCycleRoundTrip,
  tsToJsonSpec,
} from '@frenchexdev2/requirements-spec-io/bidi-sync-core';
import { generateFeatureSource, specToJson } from '@frenchexdev2/requirements-spec-io/spec-to-source';
import type { FeatureSpec, FeatureId, RequirementId, AcName } from '@frenchexdev2/requirements-core/types';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import { Priority, TestLevel } from '@frenchexdev2/requirements-core';

const fid = (s: string) => s as FeatureId;
const rid = (s: string) => s as RequirementId;
const an = (s: string) => s as AcName;

function featureSpec(partial: Partial<FeatureSpec> = {}): FeatureSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: fid('CART'),
    title: 'Cart persistence',
    priority: Priority.High,
    satisfies: [rid('REQ-CART-PERSIST')],
    acs: [
      { name: an('persistsAcrossReloads'), expects: [TestLevel.Unit] },
      { name: an('walksFullCheckout'), expects: [TestLevel.EndToEnd] },
    ],
    ...partial,
  };
}

/** In-memory FileSystem mock, covers all methods syncBidirectional touches. */
function memFs(initial: Record<string, string> = {}): FileSystem & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async readFile(path: string) {
      const v = files.get(path);
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return v;
    },
    async writeFile(path: string, content: string) {
      files.set(path, content);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async mkdir() {},
    async readdir() { return []; },
    async stat(path: string) {
      const v = files.get(path);
      /* v8 ignore next */
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return { mtimeMs: 0, isDirectory: () => false, size: v.length };
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// tsToJsonSpec / jsonToTsSpec
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureBidirectionalSyncFeature)
class DirectionTests {
  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncTsToJson')
  'TS source parses and serialises to a JSON identical to the spec JSON'() {
    const src = generateFeatureSource(featureSpec());
    const { spec, json } = tsToJsonSpec(src);
    expect(spec.id).toBe('CART');
    expect(json).toBe(specToJson(spec));
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'JSON source parses and generates TS identical to generator output'() {
    const spec = featureSpec();
    const { ts } = jsonToTsSpec(specToJson(spec));
    expect(ts).toBe(generateFeatureSource(spec));
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'JSON parsed without $schemaVersion is normalised to current version'() {
    const { $schemaVersion: _v, ...stripped } = featureSpec();
    void _v;
    const raw = JSON.stringify(stripped);
    const { spec } = jsonToTsSpec(raw);
    expect(spec.$schemaVersion).toBe(SCHEMA_VERSION);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncEmitsSchemaVersionOnJsonOutput')
  'JSON output always carries $schemaVersion as the second key'() {
    const src = generateFeatureSource(featureSpec());
    const { json } = tsToJsonSpec(src);
    const lines = json.split('\n');
    expect(lines[1]!.trimStart().startsWith('"$schema"')).toBe(true);
    expect(lines[2]!.trimStart().startsWith('"$schemaVersion"')).toBe(true);
    expect(json).toContain(`"$schemaVersion": "${SCHEMA_VERSION}"`);
  }
}
void DirectionTests;

// ══════════════════════════════════════════════════════════════════════════════
// threeCycleRoundTrip / detectDivergence / contentHash
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureBidirectionalSyncFeature)
class IdempotenceTests {
  @Verifies<FeatureBidirectionalSyncFeature>('roundTripIsIdempotentAfterThreeCycles')
  'three cycles converge to a byte-identical fixed point'() {
    const src = generateFeatureSource(featureSpec());
    const result = threeCycleRoundTrip(src);
    expect(result.converged).toBe(true);
    expect(result.cycles).toHaveLength(3);
    expect(result.cycles[1]!.ts).toBe(result.cycles[2]!.ts);
    expect(result.cycles[1]!.json).toBe(result.cycles[2]!.json);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncDetectsDivergenceBetweenSources')
  'detects when TS-derived JSON differs from JSON on disk'() {
    const src = generateFeatureSource(featureSpec());
    const badJson = specToJson(featureSpec({ title: 'Different' }));
    const report = detectDivergence(src, badJson);
    expect(report.diverged).toBe(true);
    expect(report.tsDerivedJson).not.toBe(report.onDiskJson);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncDetectsDivergenceBetweenSources')
  'reports no divergence when both sides agree (modulo trailing whitespace)'() {
    const src = generateFeatureSource(featureSpec());
    const { json } = tsToJsonSpec(src);
    expect(detectDivergence(src, json).diverged).toBe(false);
    // Trailing whitespace tolerated.
    expect(detectDivergence(src, json + '\n\n').diverged).toBe(false);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncRefusesAmbiguousMerge')
  'contentHash is stable for identical inputs and differs for distinct ones'() {
    expect(contentHash('hello')).toBe(contentHash('hello'));
    expect(contentHash('hello')).not.toBe(contentHash('world'));
    expect(contentHash('')).toMatch(/^[0-9a-f]{8}$/);
  }
}
void IdempotenceTests;

// ══════════════════════════════════════════════════════════════════════════════
// syncBidirectional — orchestration
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureBidirectionalSyncFeature)
class OrchestrationTests {
  @Verifies<FeatureBidirectionalSyncFeature>('syncWritesViaFileSystemPort')
  'writes only via the FileSystem port and produces the expected JSON'() {
    return (async () => {
      const tsSource = generateFeatureSource(featureSpec());
      const fs = memFs({ 'cart.ts': tsSource });
      const result = await syncBidirectional(
        { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
        fs,
        { direction: 'ts-to-json' },
        () => '2026-04-14T00:00:00Z',
      );
      expect(result.wrote).toEqual(['cart.spec.json']);
      expect(fs.files.has('cart.spec.json')).toBe(true);
      expect(fs.files.has('cart.spec.json.sync')).toBe(true);
      expect(fs.files.get('cart.spec.json')).toContain(`"$schemaVersion"`);
    })();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'json-to-ts direction writes the TS file via the port'() {
    return (async () => {
      const spec = featureSpec();
      const fs = memFs({ 'cart.spec.json': specToJson(spec) });
      const result = await syncBidirectional(
        { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
        fs,
        { direction: 'json-to-ts' },
        () => '2026-04-14T00:00:00Z',
      );
      expect(result.wrote).toEqual(['cart.ts']);
      expect(fs.files.get('cart.ts')).toBe(generateFeatureSource(spec));
    })();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncRefusesWhenTsDoesNotCompile')
  'refuses ts-to-json sync when the .ts file does not parse'() {
    return (async () => {
      const fs = memFs({ 'cart.ts': 'export class { 123 !@#' });
      await expect(
        syncBidirectional(
          { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
          fs,
          { direction: 'ts-to-json' },
        ),
      ).rejects.toBeInstanceOf(SyncRefusedCompileError);
    })();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncRefusesAmbiguousMerge')
  'refuses when BOTH sides changed since last sync marker'() {
    return (async () => {
      const tsSource = generateFeatureSource(featureSpec());
      const jsonSource = specToJson(featureSpec());
      // Marker says last-known state had DIFFERENT hashes for both sides.
      const marker = {
        tsHash: contentHash('stale-ts'),
        jsonHash: contentHash('stale-json'),
        at: '2026-04-14T00:00:00Z',
      };
      const fs = memFs({
        'cart.ts': tsSource,
        'cart.spec.json': jsonSource,
        'cart.spec.json.sync': JSON.stringify(marker),
      });
      await expect(
        syncBidirectional(
          { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
          fs,
          { direction: 'ts-to-json' },
        ),
      ).rejects.toBeInstanceOf(AmbiguousMergeError);
    })();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncRefusesAmbiguousMerge')
  'proceeds when only one side changed since last marker'() {
    return (async () => {
      const tsSource = generateFeatureSource(featureSpec());
      const jsonSource = specToJson(featureSpec());
      const marker = {
        tsHash: contentHash(tsSource),     // ts UNCHANGED
        jsonHash: contentHash('stale'),    // json CHANGED
        at: '2026-04-14T00:00:00Z',
      };
      const fs = memFs({
        'cart.ts': tsSource,
        'cart.spec.json': jsonSource,
        'cart.spec.json.sync': JSON.stringify(marker),
      });
      const result = await syncBidirectional(
        { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
        fs,
        { direction: 'ts-to-json' },
        () => '2026-04-14T00:00:00Z',
      );
      expect(result.wrote).toEqual(['cart.spec.json']);
    })();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncRefusesAmbiguousMerge')
  'force option bypasses the ambiguous-merge check'() {
    return (async () => {
      const tsSource = generateFeatureSource(featureSpec());
      const jsonSource = specToJson(featureSpec());
      const marker = {
        tsHash: contentHash('stale-ts'),
        jsonHash: contentHash('stale-json'),
        at: '2026-04-14T00:00:00Z',
      };
      const fs = memFs({
        'cart.ts': tsSource,
        'cart.spec.json': jsonSource,
        'cart.spec.json.sync': JSON.stringify(marker),
      });
      const result = await syncBidirectional(
        { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
        fs,
        { direction: 'ts-to-json', force: true },
        () => '2026-04-14T00:00:00Z',
      );
      expect(result.wrote).toEqual(['cart.spec.json']);
    })();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncRefusesAmbiguousMerge')
  'no ambiguous-merge check when no marker exists yet (first sync)'() {
    return (async () => {
      const tsSource = generateFeatureSource(featureSpec());
      const jsonSource = specToJson(featureSpec({ title: 'different' }));
      const fs = memFs({
        'cart.ts': tsSource,
        'cart.spec.json': jsonSource,
      });
      // No marker file → no ambiguous-merge check fires.
      const result = await syncBidirectional(
        { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
        fs,
        { direction: 'ts-to-json' },
        () => '2026-04-14T00:00:00Z',
      );
      expect(result.wrote).toEqual(['cart.spec.json']);
    })();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncWritesViaFileSystemPort')
  'uses a custom markerPath when provided'() {
    return (async () => {
      const tsSource = generateFeatureSource(featureSpec());
      const fs = memFs({ 'cart.ts': tsSource });
      await syncBidirectional(
        { tsPath: 'cart.ts', jsonPath: 'cart.spec.json', markerPath: 'custom.marker' },
        fs,
        { direction: 'ts-to-json' },
        () => '2026-04-14T00:00:00Z',
      );
      expect(fs.files.has('custom.marker')).toBe(true);
      expect(fs.files.has('cart.spec.json.sync')).toBe(false);
    })();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncWritesViaFileSystemPort')
  'default timestamp generator is used when omitted'() {
    return (async () => {
      const tsSource = generateFeatureSource(featureSpec());
      const fs = memFs({ 'cart.ts': tsSource });
      await syncBidirectional(
        { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
        fs,
        { direction: 'ts-to-json' },
      );
      const marker = JSON.parse(fs.files.get('cart.spec.json.sync')!);
      expect(typeof marker.at).toBe('string');
      expect(marker.at.length).toBeGreaterThan(0);
    })();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('endToEndTsEditFlowsIntoJsonAndBack')
  'end-to-end: TS edit → JSON → TS round-trips through filesystem port'() {
    return (async () => {
      // Start: on-disk TS + JSON both agree, plus a marker recording that state.
      const original = featureSpec();
      const tsA = generateFeatureSource(original);
      const jsonA = specToJson(original);
      const marker = {
        tsHash: contentHash(tsA),
        jsonHash: contentHash(jsonA),
        at: '2026-04-14T00:00:00Z',
      };
      const fs = memFs({
        'cart.ts': tsA,
        'cart.spec.json': jsonA,
        'cart.spec.json.sync': JSON.stringify(marker),
      });

      // Developer edits the TS file: changes title.
      const edited = featureSpec({ title: 'Cart persistence v2' });
      const tsB = generateFeatureSource(edited);
      await fs.writeFile('cart.ts', tsB);

      // Sync TS → JSON propagates the edit.
      const r1 = await syncBidirectional(
        { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
        fs,
        { direction: 'ts-to-json' },
        () => '2026-04-14T00:00:01Z',
      );
      expect(r1.spec.title).toBe('Cart persistence v2');

      // Now sync back JSON → TS; must round-trip to a byte-identical TS.
      const r2 = await syncBidirectional(
        { tsPath: 'cart.ts', jsonPath: 'cart.spec.json' },
        fs,
        { direction: 'json-to-ts' },
        () => '2026-04-14T00:00:02Z',
      );
      expect(r2.spec.title).toBe('Cart persistence v2');
      expect(fs.files.get('cart.ts')).toBe(tsB);
    })();
  }
}
void OrchestrationTests;
