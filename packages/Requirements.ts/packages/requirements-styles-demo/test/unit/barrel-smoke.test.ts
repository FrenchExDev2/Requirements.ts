import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';

import { DemoBarrelSmokeFeature } from '../../requirements/features/barrel-smoke.js';


@FeatureTest(DemoBarrelSmokeFeature)
class BarrelSmokeTests {
  @Verifies<DemoBarrelSmokeFeature>('barrelExportsThreeFsms')
  async 'three FSM classes are re-exported'() {
    const demo = await import('../../src/index');
    expect(typeof demo.ProjectLifecycleFsm).toBe('function');
    expect(typeof demo.PerFeatureFsm).toBe('function');
    expect(typeof demo.PerAcFsm).toBe('function');
  }

  @Verifies<DemoBarrelSmokeFeature>('barrelExportsOrchestrator')
  async 'orchestrator surface is re-exported'() {
    const demo = await import('../../src/index');
    expect(typeof demo.ScenarioOrchestrator).toBe('function');
    expect(typeof demo.makeScenarioOrchestratorPort).toBe('function');
    expect(typeof demo.makeOrchestratorEventAdapter).toBe('function');
  }

  @Verifies<DemoBarrelSmokeFeature>('barrelExportsScenarioCommands')
  async 'scenario command cores are re-exported'() {
    const demo = await import('../../src/index');
    expect(typeof demo.validateScenario).toBe('function');
    expect(typeof demo.listScenarios).toBe('function');
    expect(typeof demo.playScenario).toBe('function');
    expect(typeof demo.inspectScenario).toBe('function');
    expect(typeof demo.exportScenario).toBe('function');
    expect(typeof demo.recordFromProject).toBe('function');
    expect(typeof demo.StubAiAdapter).toBe('function');
    expect(typeof demo.selectAdapter).toBe('function');
  }

  @Verifies<DemoBarrelSmokeFeature>('schemaAndScenariosAreBundled')
  async 'schema and scenarios are on disk next to package'() {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgRoot = path.resolve(here, '..', '..');
    const schemaPath = path.join(pkgRoot, 'schemas', 'scenario.schema.json');
    const scenariosDir = path.join(pkgRoot, 'scenarios');
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    expect(typeof schema).toBe('object');
    const files = await fs.readdir(scenariosDir);
    expect(files.some((f) => f.endsWith('.scenario.json'))).toBe(true);
  }
}
void BarrelSmokeTests;
