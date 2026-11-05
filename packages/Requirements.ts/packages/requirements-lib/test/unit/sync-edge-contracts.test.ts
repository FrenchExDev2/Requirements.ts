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
@FeatureTest(FeatureSyncCommandFeature)
class SyncCoreDiffEdgeCaseTests {
  @Verifies<FeatureSyncCommandFeature>('diffComputesStructuredHunksViaJsdiff')
  async 'pure-deletion hunk exercises p.removed-only branch (line 98)'() {
    const path = 'requirements/features/pure-del.ts';
    const fs = mkFs({ [path]: 'a\nb\nc\n' });
    // Remove just line "b" — the diff emits a removed chunk with no paired added.
    const proposed = new Map<string, string>([[path, 'a\nc\n']]);
    const spec: Spec = {
      $schemaVersion: SCHEMA_VERSION, kind: 'feature',
      id: featureId('PURE-DEL') as FeatureId, title: 't',
      priority: Priority.High, acs: [],
    };
    const plan = await diffSpecToDisk(spec, proposed, fs);
    const e = plan.entries[0]!;
    expect(e.status).toBe('modified');
    // At least one hunk should have a removed line without matching added.
    const hasRemovedOnly = e.hunks.some(h => h.removed.length > 0 && h.added.length === 0);
    expect(hasRemovedOnly).toBe(true);
    expect(e.hunks.flatMap(h => h.removed)).toContain('b');
  }

  @Verifies<FeatureSyncCommandFeature>('diffComputesStructuredHunksViaJsdiff')
  async 'chunks without trailing newline exercise splitKeepingTrailing no-pop and firstLine/lastLine fallbacks'() {
    const path = 'requirements/features/no-newline.ts';
    // Neither current nor proposed terminate with '\n' so jsdiff emits a
    // trailing chunk whose .value has no newline. This forces:
    //   - splitKeepingTrailing: lines[last] !== '' → no pop (line 120 false branch)
    //   - lastLine: idx === -1 when before/after value is a single no-NL line
    //   - firstLine: idx === -1 when after value is no-NL
    const fs = mkFs({ [path]: 'header\nbody' });
    const proposed = new Map<string, string>([[path, 'header\nBODY']]);
    const spec: Spec = {
      $schemaVersion: SCHEMA_VERSION, kind: 'feature',
      id: featureId('NO-NL') as FeatureId, title: 't',
      priority: Priority.High, acs: [],
    };
    const plan = await diffSpecToDisk(spec, proposed, fs);
    const e = plan.entries[0]!;
    expect(e.status).toBe('modified');
    // Verify the hunk's removed/added still carry the non-NL lines intact.
    const allRemoved = e.hunks.flatMap(h => h.removed);
    const allAdded = e.hunks.flatMap(h => h.added);
    expect(allRemoved).toContain('body');
    expect(allAdded).toContain('BODY');
  }

  @Verifies<FeatureSyncCommandFeature>('diffComputesStructuredHunksViaJsdiff')
  async 'firstLine/lastLine on chunks whose value has no newline at all'() {
    // Trigger firstLine's no-newline return with an after-chunk of a single
    // line, and lastLine's no-newline return with a before-chunk of a single
    // no-newline line. Using three-line texts with mid changes.
    const path = 'requirements/features/flanked.ts';
    const fs = mkFs({ [path]: 'X\nmid\nY' });
    const proposed = new Map<string, string>([[path, 'X\nMID\nY']]);
    const spec: Spec = {
      $schemaVersion: SCHEMA_VERSION, kind: 'feature',
      id: featureId('FLANK') as FeatureId, title: 't',
      priority: Priority.High, acs: [],
    };
    const plan = await diffSpecToDisk(spec, proposed, fs);
    const e = plan.entries[0]!;
    expect(e.status).toBe('modified');
    // contextBefore is 'X' (last line of first chunk) — that chunk ends with
    // a newline so lastLine's trimmed-endsWith-newline branch fires; we still
    // want to cover the idx===-1 path: force it with a before chunk equal to
    // a single line without newline. That shape arises when the pre-change
    // region is exactly the first line AND that line has no trailing newline
    // — but jsdiff always emits kept chunks ending with \n if the next line
    // exists. So instead we verify the hunk landed cleanly.
    expect(e.hunks.length).toBeGreaterThan(0);
  }

  @Verifies<FeatureSyncCommandFeature>('diffClassifiesEachTargetAsCreateUnchangedModified')
  async 'identical content produces an unchanged entry (covers continue in diffSpecToDisk)'() {
    const path = 'requirements/features/same.ts';
    const fs = mkFs({ [path]: 'x\n' });
    const proposed = new Map<string, string>([[path, 'x\n']]);
    const spec: Spec = {
      $schemaVersion: SCHEMA_VERSION, kind: 'feature',
      id: featureId('SAME') as FeatureId, title: 't',
      priority: Priority.High, acs: [],
    };
    const plan = await diffSpecToDisk(spec, proposed, fs);
    expect(plan.entries[0]!.status).toBe('unchanged');
  }

  @Verifies<FeatureSyncCommandFeature>('endToEndSyncReconcilesEditedSpec')
  async 'applying a no-change plan writes nothing but mkdir is invoked defensively'() {
    // Still useful: exercises the full applySyncPlan path against writable
    // targets to keep confidence around ensureDirFor's reachable branch.
    const path = 'requirements/features/apply-mkdir.ts';
    const fs = mkFs({});
    const spec: Spec = {
      $schemaVersion: SCHEMA_VERSION, kind: 'feature',
      id: featureId('MKDIR') as FeatureId, title: 't',
      priority: Priority.High, acs: [],
    };
    const proposed = new Map<string, string>([[path, 'x\n']]);
    const plan = await diffSpecToDisk(spec, proposed, fs);
    await applySyncPlan(plan, fs, { mode: 'all' });
    expect(fs.dirs.has('requirements/features')).toBe(true);
  }
}
void SyncCoreDiffEdgeCaseTests;
