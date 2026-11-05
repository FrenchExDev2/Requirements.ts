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
@FeatureTest(FeatureNewCommandFeature)
class SpecToSourceEmptyRegistryTests {
  @Verifies<FeatureNewCommandFeature>('scaffoldsUnitTestsForUncoveredAcs')
  'planWrites skips levels with no registered scaffolder (line 271)'() {
    const spec: Spec = mkFeatureSpec();
    const emptyRegistry = createRegistry([]);
    const config: WritePlanConfig = {
      featuresDir: 'requirements/features',
      requirementsDir: 'requirements/requirements',
    };
    const plan = planWrites(spec, config, emptyRegistry);
    // No scaffolder for 'unit' → scaffoldPaths stays empty.
    expect(plan.scaffoldPaths).toEqual([]);
    // Source / spec paths still computed.
    expect(plan.sourcePath).toBe('requirements/features/empty-reg.ts');
    expect(plan.specPath).toBe('requirements/features/empty-reg.spec.json');
  }

  @Verifies<FeatureNewCommandFeature>('scaffoldsUnitTestsForUncoveredAcs')
  'generateScaffoldForSpec returns "" when registry has no scaffolder for level (line 313)'() {
    const spec = mkFeatureSpec();
    const emptyRegistry = createRegistry([]);
    const out = generateScaffoldForSpec(spec, 'unit' as TestLevelString, emptyRegistry);
    expect(out).toBe('');
  }
}
void SpecToSourceEmptyRegistryTests;
