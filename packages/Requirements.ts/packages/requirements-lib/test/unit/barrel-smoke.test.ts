import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';

import { LibBarrelSmokeFeature } from '../../requirements/features/barrel-smoke.js';


@FeatureTest(LibBarrelSmokeFeature)
class BarrelSmokeTests {
  @Verifies<LibBarrelSmokeFeature>('barrelExportsCoreKernel')
  async 'kernel symbols are re-exported'() {
    const lib = await import('../../src/index');
    expect(typeof lib.FeatureTest).toBe('function');
    expect(typeof lib.Verifies).toBe('function');
    expect(typeof lib.Satisfies).toBe('function');
    expect(typeof lib.Refines).toBe('function');
  }

  @Verifies<LibBarrelSmokeFeature>('barrelExportsSpecDtos')
  async 'spec DTO surface is re-exported'() {
    const lib = await import('../../src/index');
    expect(typeof lib.featureId).toBe('function');
    expect(typeof lib.requirementId).toBe('function');
    expect(typeof lib.SCHEMA_VERSION).toBe('string');
  }

  @Verifies<LibBarrelSmokeFeature>('barrelExportsAnalysisSurface')
  async 'analysis surface is re-exported'() {
    const lib = await import('../../src/index');
    expect(typeof lib.readFeatures).toBe('function');
    expect(typeof lib.scanTestFiles).toBe('function');
    expect(typeof lib.generateReport).toBe('function');
  }

  @Verifies<LibBarrelSmokeFeature>('schemasAreBundled')
  async 'schemas directory is reachable from schema-generate'() {
    const lib = await import('@frenchexdev2/requirements-spec-io/schema-generate');
    const dir = lib.defaultSchemasDir();
    // Contract: defaultSchemasDir() resolves to a `schemas/` sibling of src/ or dist/.
    // Don't pin to the monorepo path — that breaks any cwd-relocating runner
    // (Stryker sandbox, future repackaging). The basename `schemas` is the real invariant.
    expect(dir.replace(/\\/g, '/')).toMatch(/\/schemas$/);
  }
}
void BarrelSmokeTests;
