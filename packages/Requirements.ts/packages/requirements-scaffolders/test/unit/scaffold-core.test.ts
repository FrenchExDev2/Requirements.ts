import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScaffoldCoreFeature } from '@frenchexdev2/requirements-requirements';
import {
  findUncoveredACs,
  generateUnitTestStub,
  generateE2eTestStub,
  buildScaffoldResult,
} from '../../src/scaffold-core';
import type { FeatureMeta, TestRef } from '@frenchexdev2/requirements-compliance';

function feat(partial: Partial<FeatureMeta> = {}): FeatureMeta {
  return {
    id: 'F1',
    title: 'Feature One',
    priority: 'high',
    acMethods: ['alpha', 'beta'],
    acDetails: [
      { name: 'alpha', expectedLevels: ['unit'] },
      { name: 'beta', expectedLevels: ['unit', 'e2e'] },
    ],
    enabled: true,
    className: 'OneFeature',
    file: 'one.ts',
    satisfies: [],
    ...partial,
  };
}

function ref(partial: Partial<TestRef> = {}): TestRef {
  return {
    feature: 'OneFeature',
    featureId: 'F1',
    ac: 'alpha',
    testFile: 'test/unit/one.test.ts',
    testName: 'alpha behaves',
    level: 'unit',
    ...partial,
  };
}

@FeatureTest(ScaffoldCoreFeature)
class FindUncoveredTests {
  @Verifies<ScaffoldCoreFeature>('skipsAcsWhereExpectedLevelsOmitTarget')
  'skips AC when expected levels do not include target'() {
    const f = feat({
      acMethods: ['onlyE2e'],
      acDetails: [{ name: 'onlyE2e', expectedLevels: ['e2e'] }],
    });
    expect(findUncoveredACs(f, [], 'unit')).toEqual([]);
  }

  @Verifies<ScaffoldCoreFeature>('marksAcsMissingExpectedLevel')
  'marks AC missing expected level'() {
    const f = feat();
    const r = findUncoveredACs(f, [], 'unit');
    expect(r).toEqual([
      { ac: 'alpha', missingLevels: ['unit'] },
      { ac: 'beta', missingLevels: ['unit'] },
    ]);
  }

  @Verifies<ScaffoldCoreFeature>('ignoresAcsAlreadyCoveredAtLevel')
  'ignores already-covered ACs'() {
    const f = feat();
    const refs = [ref({ ac: 'alpha', level: 'unit' })];
    const r = findUncoveredACs(f, refs, 'unit');
    expect(r.map(u => u.ac)).toEqual(['beta']);
  }

  @Verifies<ScaffoldCoreFeature>('matchesRefsByFeatureIdDirect')
  'matches test refs via direct featureId match'() {
    const f = feat();
    const refs = [ref({ feature: 'Unknown', featureId: 'F1', ac: 'alpha', level: 'unit' })];
    expect(findUncoveredACs(f, refs, 'unit').map(u => u.ac)).toEqual(['beta']);
  }

  @Verifies<ScaffoldCoreFeature>('matchesRefsByClassNameFallback')
  'matches via className fallback when featureId differs'() {
    const f = feat();
    const refs = [ref({ feature: 'OneFeature', featureId: 'OTHER', ac: 'alpha', level: 'unit' })];
    expect(findUncoveredACs(f, refs, 'unit').map(u => u.ac)).toEqual(['beta']);
  }

  @Verifies<ScaffoldCoreFeature>('defaultsAcDetailsToUnitWhenMissing')
  'defaults to [unit] when no acDetails entry'() {
    const f = feat({
      acMethods: ['orphan'],
      acDetails: [],
    });
    expect(findUncoveredACs(f, [], 'unit')).toEqual([{ ac: 'orphan', missingLevels: ['unit'] }]);
    // And when the target level isn't unit, default excludes it
    expect(findUncoveredACs(f, [], 'e2e')).toEqual([]);
  }
}
void FindUncoveredTests;

@FeatureTest(ScaffoldCoreFeature)
class GenerateStubTests {
  @Verifies<ScaffoldCoreFeature>('returnsEmptyStringWhenNoUncovered')
  'returns empty string when no uncovered ACs'() {
    expect(generateUnitTestStub(feat(), [])).toBe('');
  }

  @Verifies<ScaffoldCoreFeature>('emitsUnitStubWithFeatureImportAndDecorators')
  'emits a unit stub with imports and decorators'() {
    const src = generateUnitTestStub(feat(), [{ ac: 'alpha', missingLevels: ['unit'] }]);
    expect(src).toContain(`import { expect } from 'vitest';`);
    expect(src).toContain(`import { FeatureTest, Verifies } from '@frenchexdev2/requirements';`);
    expect(src).toContain(`import { OneFeature } from '@frenchexdev2/requirements-requirements';`);
    expect(src).toContain(`@FeatureTest(OneFeature)`);
    expect(src).toContain(`class OneScaffoldTests {`);
    expect(src).toContain(`@Verifies<OneFeature>('alpha')`);
    expect(src).toContain(`throw new Error('Not implemented: F1/alpha');`);
  }

  @Verifies<ScaffoldCoreFeature>('unitStubStripsTsExtensionFromFile')
  'emits no .ts extension in import (vocabulary centralized in @frenchexdev2/requirements-requirements)'() {
    const src = generateUnitTestStub(feat({ file: 'deep.ts' }), [{ ac: 'alpha', missingLevels: ['unit'] }]);
    expect(src).toContain(`from '@frenchexdev2/requirements-requirements'`);
    expect(src).not.toContain(`.ts'`);
  }

  @Verifies<ScaffoldCoreFeature>('e2eReturnsEmptyStringWhenNoUncovered')
  'e2e returns empty string when no uncovered ACs'() {
    expect(generateE2eTestStub(feat(), [])).toBe('');
  }

  @Verifies<ScaffoldCoreFeature>('emitsE2eStubWithPlaywrightImport')
  'emits an e2e stub with Playwright import'() {
    const src = generateE2eTestStub(feat(), [{ ac: 'beta', missingLevels: ['e2e'] }]);
    expect(src).toContain(`import { test, expect } from '@playwright/test';`);
    expect(src).toContain(`class OneE2eTests {`);
    expect(src).toContain(`async 'beta'()`);
    expect(src).toContain(`throw new Error('Not implemented: F1/beta');`);
  }
}
void GenerateStubTests;

@FeatureTest(ScaffoldCoreFeature)
class BuildScaffoldResultTests {
  @Verifies<ScaffoldCoreFeature>('buildsUnitScaffoldForUnitLevel')
  'builds unit scaffold for unit level'() {
    const r = buildScaffoldResult(feat(), [], 'unit');
    expect(r.targetPath).toBe('test/unit/one-scaffold.test.ts');
    expect(r.generatedSource).toContain(`import { expect } from 'vitest';`);
    expect(r.uncovered.length).toBeGreaterThan(0);
  }

  @Verifies<ScaffoldCoreFeature>('buildsE2eScaffoldForE2eLevel')
  'builds e2e scaffold for e2e level'() {
    const r = buildScaffoldResult(feat(), [], 'e2e');
    expect(r.targetPath).toBe('test/e2e/one-scaffold.spec.ts');
    expect(r.generatedSource).toContain(`@playwright/test`);
  }

  @Verifies<ScaffoldCoreFeature>('buildScaffoldPreservesFeatureMetadata')
  'preserves feature metadata on result'() {
    const r = buildScaffoldResult(feat(), [], 'unit');
    expect(r.featureId).toBe('F1');
    expect(r.featureClassName).toBe('OneFeature');
    expect(r.featureFile).toBe('one.ts');
  }
}
void BuildScaffoldResultTests;
