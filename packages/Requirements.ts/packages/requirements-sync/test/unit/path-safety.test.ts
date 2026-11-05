import { expect, vi } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureSyncCommandFeature } from '@frenchexdev2/requirements-requirements';
import { applySyncPlan, RefusedWriteError } from '../../src/sync-core';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import type { SyncPlan } from '@frenchexdev2/requirements-core/types';

/** Minimal plan: the apply boundary only consumes entries, not spec metadata. */
function plan(...paths: string[]): SyncPlan {
  return { spec: {} as SyncPlan['spec'], entries: paths.map(path => ({
    path, status: 'create', proposed: 'generated', current: null, hunks: [],
  })) };
}

@FeatureTest(FeatureSyncCommandFeature)
class SyncPathSafetyTests {
  @Verifies<FeatureSyncCommandFeature>('neverTouchesNonScaffoldTestFiles')
  async rejectsTraversalBeforeAnyWrite() {
  for (const path of [
    'requirements/features/../../src/human.ts',
    'requirements/features/../human.test.ts',
    'requirements/features/nested/../../../human.ts',
    'requirements\\features\\..\\..\\src\\human.ts',
    'requirements/../private.spec.json',
    'test/unit/../../human-scaffold.test.ts',
    'notrequirements/features/human.ts',
    'contest/unit/human-scaffold.test.ts',
    'requirements/features/bad\0.ts',
  ]) {
    const fs = { mkdir: vi.fn(), writeFile: vi.fn() } as unknown as FileSystem;
    await expect(applySyncPlan(plan('requirements/features/valid.ts', path), fs, { mode: 'all' }))
      .rejects.toBeInstanceOf(RefusedWriteError);
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  }
  }

  @Verifies<FeatureSyncCommandFeature>('neverTouchesNonScaffoldTestFiles')
  async preservesSupportedAbsoluteAndRelativePaths() {
  for (const path of [
    'requirements/features/nested/éligibilité.ts',
    'C:\\projet\\requirements\\features\\nested\\valid.ts',
    '/project/requirements/requirements/nested/valid.ts',
  ]) {
    const fs = { mkdir: vi.fn(async () => {}), writeFile: vi.fn(async () => {}) } as unknown as FileSystem;
    await expect(applySyncPlan(plan(path), fs, { mode: 'all' })).resolves.toMatchObject({ applied: [path] });
    expect(fs.writeFile).toHaveBeenCalledWith(path, 'generated');
  }
  }
}
void SyncPathSafetyTests;
