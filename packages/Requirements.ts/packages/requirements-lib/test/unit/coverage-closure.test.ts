import { afterEach, expect, vi } from 'vitest';
import { FeatureTest, Verifies } from '../../src';
import { FeatureNewCommandFeature } from '@frenchexdev2/requirements-requirements';
import { FeatureSyncCommandFeature } from '@frenchexdev2/requirements-requirements';
import { FeatureSchemaCommandFeature } from '@frenchexdev2/requirements-requirements';
import { Priority, TestLevel } from '../../src';
import { DefaultStyle } from '@frenchexdev2/requirements-styles';
import type {
  Prompt,
  PromptChoice,
  PromptSpinner,
  PromptTextOptions,
  FileSystem,
} from '@frenchexdev2/requirements-core/ports';
import {
  SCHEMA_VERSION,
  featureId,
  requirementId,
  type FeatureSpec,
  type RequirementId,
  type Spec,
  type FeatureId,
  type AcName,
} from '@frenchexdev2/requirements-core/types';
import { runFeatureWizard } from '@frenchexdev2/requirements-wizards';
import { registerSchema } from '@frenchexdev2/requirements-spec-io/schema-register';
import {
  planWrites,
  generateScaffoldForSpec,
  type TestLevelString,
  type WritePlanConfig,
} from '@frenchexdev2/requirements-scaffolders';
import { createRegistry } from '@frenchexdev2/requirements-scaffolders';
import {
  diffSpecToDisk,
  applySyncPlan,
} from '@frenchexdev2/requirements-sync';
function mkFs(initial: Record<string, string> = {}): FileSystem & {
  files: Map<string, string>; dirs: Set<string>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  const dirs = new Set<string>();
  return {
    files, dirs,
    async readFile(p: string, _enc: 'utf8') {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    async writeFile(p: string, content: string) { files.set(p, content); },
    async exists(p: string) { return files.has(p) || dirs.has(p); },
    async mkdir(p: string, _opts?: { recursive?: boolean }) { dirs.add(p); },
    async readdir(_p: string) { return []; },
    async stat(_p: string) {
      return { mtimeMs: 0, size: 0, isDirectory: () => false };
    },
  };
}
type Queues = {
  text: Array<string | ((q: string, opts?: PromptTextOptions) => string)>;
  select: Array<string | ((q: string, c: readonly PromptChoice[], d?: string) => string)>;
  multiselect: Array<readonly string[] | ((q: string, c: readonly PromptChoice[], d?: readonly string[]) => readonly string[])>;
  confirm: Array<boolean | ((q: string, d?: boolean) => boolean)>;
};
function mkPrompt(q: Partial<Queues> = {}): Prompt {
  const qu: Queues = {
    text: [...(q.text ?? [])],
    select: [...(q.select ?? [])],
    multiselect: [...(q.multiselect ?? [])],
    confirm: [...(q.confirm ?? [])],
  };
  const spinner: PromptSpinner = { start: () => {}, stop: () => {} };
  return {
    async text(question, opts) {
      const next = qu.text.shift();
      if (next === undefined) throw new Error(`unexpected text('${question}')`);
      const v = typeof next === 'function' ? next(question, opts) : next;
      if (opts?.validate) {
        const e = opts.validate(v);
        if (e) throw new Error(`validate failed: ${e}`);
      }
      return v;
    },
    async select(question, choices, dflt) {
      const n = qu.select.shift();
      if (n === undefined) throw new Error(`unexpected select('${question}')`);
      return (typeof n === 'function' ? n(question, choices, dflt) : n) as never;
    },
    async multiselect(question, choices, dflt) {
      const n = qu.multiselect.shift();
      if (n === undefined) throw new Error(`unexpected multiselect('${question}')`);
      return (typeof n === 'function' ? n(question, choices, dflt) : n) as never;
    },
    async confirm(question, dflt) {
      const n = qu.confirm.shift();
      if (n === undefined) throw new Error(`unexpected confirm('${question}')`);
      return typeof n === 'function' ? n(question, dflt) : n;
    },
    note() {},
    spinner() { return spinner; },
  };
}
afterEach(() => {
  vi.doUnmock('ajv');
  vi.resetModules();
});
function validFeatureSpec(): unknown {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: 'FEATURE-X',
    title: 'Example',
    priority: 'medium',
    acs: [{ name: 'doesSomething', expects: ['unit'] }],
  };
}
function mkFeatureSpec(): FeatureSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: featureId('EMPTY-REG'),
    title: 'Empty registry coverage',
    priority: Priority.High,
    acs: [
      { name: 'doesUnit' as AcName, expects: [TestLevel.Unit] },
    ],
  };
}
@FeatureTest(FeatureSchemaCommandFeature)
class SchemaGenerateAjvTests {
  @Verifies<FeatureSchemaCommandFeature>('validateSpecAgainstSchemaRejectsMalformed')
  async 'validateSpec cached path — second call hits early-return (line 121)'() {
    vi.resetModules();
    const mod = await import('@frenchexdev2/requirements-spec-io/schema-generate');
    mod.__resetValidatorCache();
    const r1 = await mod.validateSpec(validFeatureSpec());
    expect(r1.ok).toBe(true);
    // Second call WITHOUT resetting cache — hits `if (featureValidator && requirementValidator) return;`
    const r2 = await mod.validateSpec(validFeatureSpec());
    expect(r2.ok).toBe(true);
    mod.__resetValidatorCache();
  }

  @Verifies<FeatureSchemaCommandFeature>('validateSpecAgainstSchemaRejectsMalformed')
  async 'ajv compile returns validator with null errors → line 147 (?? []) and line 149 (?? "invalid")'() {
    vi.resetModules();
    type ValidateFn = ((s: unknown) => boolean) & {
      errors?: readonly { instancePath: string; message?: string }[] | null;
    };
    class FakeAjv {
      constructor(_opts?: unknown) {}
      compile(_schema: unknown): ValidateFn {
        // Returns false (invalid) but .errors stays null → (vfn.errors ?? []).
        const fn = ((_s: unknown) => false) as ValidateFn;
        fn.errors = null;
        return fn;
      }
    }
    vi.doMock('ajv', () => ({ default: FakeAjv }));

    const mod = await import('@frenchexdev2/requirements-spec-io/schema-generate');
    mod.__resetValidatorCache();
    const r = await mod.validateSpec(validFeatureSpec());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // errors array is [] (null fell through to ??)
      expect(r.errors).toEqual([]);
    }

    // Second scenario: errors present but message is undefined → (e.message ?? 'invalid')
    mod.__resetValidatorCache();
    vi.resetModules();
    vi.doUnmock('ajv');

    class FakeAjv2 {
      constructor(_opts?: unknown) {}
      compile(_schema: unknown): ValidateFn {
        const fn = ((_s: unknown) => false) as ValidateFn;
        fn.errors = [{ instancePath: '', message: undefined }];
        return fn;
      }
    }
    vi.doMock('ajv', () => ({ default: FakeAjv2 }));
    const mod2 = await import('@frenchexdev2/requirements-spec-io/schema-generate');
    mod2.__resetValidatorCache();
    const r2 = await mod2.validateSpec(validFeatureSpec());
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.errors[0]!.message).toBe('invalid');
      expect(r2.errors[0]!.path).toBe('/');
    }
    mod2.__resetValidatorCache();
  }
}
void SchemaGenerateAjvTests;
@FeatureTest(FeatureSchemaCommandFeature)
class SchemaRegisterEmptyFileMatchTests {
  @Verifies<FeatureSchemaCommandFeature>('registerCommandMergesIntoExistingSettings')
  async 'merge honors existing entries with empty fileMatch (no conflict)'() {
    const ROOT = '/tmp/proj-empty';
    const SETTINGS = `${ROOT}/.vscode/settings.json`;
    // Existing entry has fileMatch: [] — sameFileMatch() must return false for
    // every comparison, so neither side reports a conflict.
    const existing = {
      'json.schemas': [
        { fileMatch: [], url: 'https://example.com/other.schema.json' },
      ],
    };
    const fs = mkFs({ [SETTINGS]: JSON.stringify(existing) });
    const r = await registerSchema({ projectRoot: ROOT, fs });
    expect(r.mode).toBe('merged');
    const written = JSON.parse(fs.files.get(SETTINGS)!) as {
      'json.schemas': Array<{ fileMatch: string[]; url: string }>;
    };
    // Existing zero-pattern entry is preserved; ours are appended.
    expect(written['json.schemas'].length).toBe(3);
    // The zero-pattern entry survived the filter (no same-fileMatch match).
    expect(written['json.schemas'].some(e => e.fileMatch.length === 0)).toBe(true);
  }

  @Verifies<FeatureSchemaCommandFeature>('registerCommandMergesIntoExistingSettings')
  async 'conflict detection skips entries with empty fileMatch'() {
    const ROOT = '/tmp/proj-empty-both';
    const SETTINGS = `${ROOT}/.vscode/settings.json`;
    // Two entries both with empty fileMatch — neither conflicts with ours.
    const existing = {
      'json.schemas': [
        { fileMatch: [], url: 'a' },
        { fileMatch: [], url: 'b' },
      ],
    };
    const fs = mkFs({ [SETTINGS]: JSON.stringify(existing) });
    const r = await registerSchema({ projectRoot: ROOT, fs });
    expect(r.mode).toBe('merged');
  }
}
void SchemaRegisterEmptyFileMatchTests;
