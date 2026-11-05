import { expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { createRequire } from 'node:module';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureSchemaCommandFeature } from '@frenchexdev2/requirements-requirements';
import {
  generateSchemas,
  validateSpec,
  defaultSchemasDir,
  FEATURE_SCHEMA_FILENAME,
  REQUIREMENT_SCHEMA_FILENAME,
  FEATURE_SCHEMA_REF,
  REQUIREMENT_SCHEMA_REF,
  __resetValidatorCache,
} from '@frenchexdev2/requirements-spec-io/schema-generate';

const schemasDir = defaultSchemasDir();

async function readSchema(file: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(schemasDir, file), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function validFeatureSpec(): unknown {
  return {
    $schemaVersion: '2026-04-14',
    kind: 'feature',
    id: 'FEATURE-X',
    title: 'Example',
    priority: 'medium',
    acs: [{ name: 'doesSomething', expects: ['unit'] }],
  };
}

function validRequirementSpec(): unknown {
  return {
    $schemaVersion: '2026-04-14',
    kind: 'requirement',
    id: 'REQ-SAMPLE',
    title: 'Sample requirement',
    statement: { pattern: 'ubiquitous', response: 'The system shall do X.' },
    requirementKind: 'Functional',
    priority: 'high',
    status: 'Draft',
    source: { type: 'stakeholder', role: 'Product', date: '2026-04-14' },
    rationale: { claim: 'because.', kind: 'principle', evidence: [] },
    fitCriteria: [{ kind: 'narrative', text: 'manually reviewed.' }],
    verificationMethod: 'Inspection',
    risk: { level: 'Low', ifNotMet: 'nothing breaks.' },
    satisfiedBy: [],
  };
}

@FeatureTest(FeatureSchemaCommandFeature)
class GenerateSchemaTests {
  @Verifies<FeatureSchemaCommandFeature>('generateSchemaProducesValidJsonSchema')
  'committed schemas compile as Draft 7 via ajv'() {
    // delegate to validate which lazy-loads ajv.compile — that is the Draft-7 check.
    return validateSpec(validFeatureSpec()).then((r) => {
      expect(r.ok).toBe(true);
    });
  }

  @Verifies<FeatureSchemaCommandFeature>('schemaCoversAllSpecFields')
  'feature + requirement schemas list every spec field'() {
    return Promise.all([readSchema(FEATURE_SCHEMA_FILENAME), readSchema(REQUIREMENT_SCHEMA_FILENAME)]).then(
      ([feat, req]) => {
        const featProps = feat['properties'] as Record<string, unknown>;
        for (const k of ['$schemaVersion', 'kind', 'id', 'title', 'priority', 'acs', 'satisfies', 'history']) {
          expect(featProps[k]).toBeDefined();
        }
        const reqProps = req['properties'] as Record<string, unknown>;
        for (const k of [
          '$schemaVersion', 'kind', 'id', 'title', 'statement',
          'requirementKind', 'priority', 'status', 'source', 'rationale',
          'fitCriteria', 'verificationMethod', 'risk',
          'refines', 'satisfiedBy', 'tracedTo', 'history',
        ]) {
          expect(reqProps[k]).toBeDefined();
        }
      },
    );
  }

  @Verifies<FeatureSchemaCommandFeature>('schemaEnumsMatchPriorityAndTestLevelAndRequirementKind')
  'enums for priority / test-level / requirement-kind match base types'() {
    // ts-json-schema-generator normalises shared types into `definitions` and
    // references them via `$ref`. Read enums from there.
    return Promise.all([readSchema(FEATURE_SCHEMA_FILENAME), readSchema(REQUIREMENT_SCHEMA_FILENAME)]).then(
      ([feat, req]) => {
        const featDefs = feat['definitions'] as Record<string, { enum?: string[] }>;
        expect(featDefs['Priority']!.enum).toEqual(['critical', 'high', 'medium', 'low']);
        expect(featDefs['TestLevel']!.enum).toEqual([
          'unit', 'functional', 'e2e', 'a11y', 'i18n', 'visual', 'perf',
        ]);

        const reqDefs = req['definitions'] as Record<string, { enum?: string[] }>;
        expect(reqDefs['RequirementKind']!.enum).toEqual([
          'Functional', 'NonFunctional', 'Constraint', 'Compliance', 'UserStory',
        ]);
        expect(reqDefs['Priority']!.enum).toEqual(['critical', 'high', 'medium', 'low']);
      },
    );
  }

  @Verifies<FeatureSchemaCommandFeature>('wizardEmitsSchemaKeyInGeneratedSpecJson')
  '$schema path constants point to the published schemas directory'() {
    expect(FEATURE_SCHEMA_REF).toBe(
      './node_modules/@frenchexdev2/requirements-lib/schemas/feature-spec.schema.json',
    );
    expect(REQUIREMENT_SCHEMA_REF).toBe(
      './node_modules/@frenchexdev2/requirements-lib/schemas/requirement-spec.schema.json',
    );
  }
}
void GenerateSchemaTests;

@FeatureTest(FeatureSchemaCommandFeature)
class ValidateSpecTests {
  @Verifies<FeatureSchemaCommandFeature>('validateSpecAgainstSchemaRejectsMalformed')
  'validateSpec rejects malformed feature specs'() {
    __resetValidatorCache();
    return Promise.all([
      validateSpec(validFeatureSpec()).then((r) => expect(r.ok).toBe(true)),
      // malformed: unknown priority
      validateSpec({ ...(validFeatureSpec() as object), priority: 'URGENT' }).then((r) => {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
      }),
      // malformed: not an object
      validateSpec('nope').then((r) => {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors[0]!.path).toBe('/');
      }),
      // malformed: unknown kind
      validateSpec({ kind: 'something-else' }).then((r) => {
        expect(r.ok).toBe(false);
      }),
      // null
      validateSpec(null).then((r) => expect(r.ok).toBe(false)),
    ]);
  }

  @Verifies<FeatureSchemaCommandFeature>('validateSpecAgainstSchemaRejectsMalformed')
  'validateSpec accepts a valid requirement spec and rejects missing required fields'() {
    __resetValidatorCache();
    return Promise.all([
      validateSpec(validRequirementSpec()).then((r) => expect(r.ok).toBe(true)),
      validateSpec({ ...(validRequirementSpec() as object), status: undefined }).then((r) => {
        expect(r.ok).toBe(false);
      }),
      validateSpec({
        ...(validRequirementSpec() as object),
        statement: { pattern: 'does-not-exist' },
      }).then((r) => {
        expect(r.ok).toBe(false);
      }),
    ]);
  }
}
void ValidateSpecTests;

// Exercise the installed generator against the canonical public spec types.
@FeatureTest(FeatureSchemaCommandFeature, { timeout: 120_000 })
class GenerateSchemasInvocationTests {
  @Verifies<FeatureSchemaCommandFeature>('generateSchemaProducesValidJsonSchema')
  'generateSchemas writes files when ts-json-schema-generator is resolvable'() {
    return (async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'req-schema-'));
      try {
        const require = createRequire(import.meta.url);
        const kernel = path.resolve(path.dirname(require.resolve('@frenchexdev2/requirements-shared-kernel/types')), '..');
        const result = await generateSchemas({
          tsconfigPath: path.join(kernel, 'tsconfig.json'),
          typesFile: path.join(kernel, 'src/types.ts'),
          outputDir: tmp,
        });
        expect(result.featureSchemaPath.endsWith(FEATURE_SCHEMA_FILENAME)).toBe(true);
        expect(result.requirementSchemaPath.endsWith(REQUIREMENT_SCHEMA_FILENAME)).toBe(true);
        const fRaw = await fs.readFile(result.featureSchemaPath, 'utf8');
        const rRaw = await fs.readFile(result.requirementSchemaPath, 'utf8');
        const feature = JSON.parse(fRaw);
        const requirement = JSON.parse(rRaw);
        expect(feature.properties.kind.const).toBe('feature');
        expect(feature.properties.acs).toBeDefined();
        expect(requirement.properties.kind.const).toBe('requirement');
        expect(requirement.properties.fitCriteria).toBeDefined();
      } finally {
        await fs.rm(tmp, { recursive: true, force: true });
      }
    })();
  }
}
void GenerateSchemasInvocationTests;
