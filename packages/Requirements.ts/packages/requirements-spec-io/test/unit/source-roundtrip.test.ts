import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureBidirectionalSyncFeature, PropertyTestingFeature } from '@frenchexdev2/requirements-requirements';
import { generateFeatureSource, specToJson } from '../../src/spec-to-source';
import { parseFeatureSource, assertFeatureSourceCompiles } from '../../src/spec-from-source';
import { SCHEMA_VERSION, featureId, acName } from '@frenchexdev2/requirements-core/types';
import { Priority, TestLevel } from '@frenchexdev2/requirements-core';
import type { FeatureSpec } from '@frenchexdev2/requirements-core/types';

/** A real generator input, using the public branded constructors. */
function spec(title = 'Éligibilité du panier'): FeatureSpec {
  return { $schemaVersion: SCHEMA_VERSION, kind: 'feature', id: featureId('CART'), title,
    priority: Priority.High, acs: [{ name: acName('retainsCart'), expects: [TestLevel.Unit, TestLevel.EndToEnd] }] };
}

@FeatureTest(FeatureBidirectionalSyncFeature, { timeout: 120_000 })
class SourceRoundtripTests {
  @Verifies<FeatureBidirectionalSyncFeature>('roundTripIsIdempotentAfterThreeCycles')
  retainsLevelsAndUnicodeThroughThreeCycles() {
    const original = spec();
    let current = original;
    for (let i = 0; i < 3; i++) {
      current = parseFeatureSource(generateFeatureSource(JSON.parse(specToJson(current))));
    }
    expect(current).toMatchObject(original);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  preservesArbitraryTitlesAsData() {
    for (const title of ['Un titre */ encore valide', 'Ligne 1\nLigne 2', 'Été « panier » \\ "cité"']) {
      const source = generateFeatureSource(spec(title));
      expect(() => assertFeatureSourceCompiles(source)).not.toThrow();
      expect(parseFeatureSource(source).title).toBe(title);
    }
  }
}
void SourceRoundtripTests;

@FeatureTest(PropertyTestingFeature)
class SourceJsonDeterminismTests {
  @Verifies<PropertyTestingFeature>('specToJsonAlwaysHasSchemaVersionFirst')
  emitsDeterministicSchemaFirstJson() {
    const json = specToJson(spec());
    expect(json).toBe(specToJson(spec()));
    expect(Object.keys(JSON.parse(json)).slice(0, 2)).toEqual(['$schema', '$schemaVersion']);
  }
}
void SourceJsonDeterminismTests;
