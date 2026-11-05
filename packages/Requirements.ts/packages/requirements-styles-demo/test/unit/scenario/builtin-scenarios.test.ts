/**
 * Sanity: every built-in scenario file validates against scenario.schema.json
 * and meets the 'semantically complete' conventions (>=3 req, >=3 feat, >=6 AC).
 */
import { expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioListCommandFeature } from '../../../requirements/features/scenario/scenario-list-command';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..', '..', '..');
const scenariosDir = path.join(pkgRoot, 'scenarios');
const schemaPath = path.join(pkgRoot, 'schemas', 'scenario.schema.json');

const builtIns = ['shopping-cart', 'sis-iec61511', 'user-auth-scrum', 'a3-kaizen'];

@FeatureTest(ScenarioListCommandFeature)
class BuiltInScenariosTests {
  @Verifies<ScenarioListCommandFeature>('listIncludesBuiltInScenarii')
  async 'every built-in scenario validates against the schema and is semantically complete'() {
    const AjvMod: unknown = await import('ajv');
    type AjvCtor = new (opts?: { allErrors?: boolean; strict?: boolean }) => {
      compile: (s: unknown) => ((d: unknown) => boolean) & { errors?: readonly { instancePath: string; message?: string }[] | null };
    };
    const AjvCtor = ((AjvMod as { default?: AjvCtor }).default ?? (AjvMod as AjvCtor)) as AjvCtor;
    const ajv = new AjvCtor({ allErrors: true, strict: false });
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8')) as unknown;
    const validate = ajv.compile(schema);

    for (const name of builtIns) {
      const data = JSON.parse(await fs.readFile(path.join(scenariosDir, `${name}.scenario.json`), 'utf8')) as {
        id: string;
        seeds: { requirements: unknown[]; features: { acs: unknown[] }[] };
      };
      const ok = validate(data);
      if (!ok) throw new Error(`${name}: ${JSON.stringify(validate.errors)}`);
      expect(ok).toBe(true);
      expect(data.seeds.requirements.length).toBeGreaterThanOrEqual(3);
      expect(data.seeds.features.length).toBeGreaterThanOrEqual(3);
      const totalAcs = data.seeds.features.reduce((n, f) => n + f.acs.length, 0);
      expect(totalAcs).toBeGreaterThanOrEqual(6);
    }
  }
}

void BuiltInScenariosTests;
