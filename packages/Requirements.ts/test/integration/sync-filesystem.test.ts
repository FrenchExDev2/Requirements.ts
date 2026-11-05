import * as fs from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { QualificationInfrastructureFeature } from '../../packages/requirements-requirements/src/qualification-contracts.js';
import { diffSpecToDisk, applySyncPlan, RefusedWriteError } from '../../packages/requirements-sync/src/sync-core';
import { SCHEMA_VERSION, featureId } from '@frenchexdev2/requirements-shared-kernel/types';
import { Priority } from '@frenchexdev2/requirements-shared-kernel';
import type { FileSystem } from '../../packages/requirements-core/src/ports/index';

/** Real filesystem adapter restricted to this test's disposable directory. */
function filesystem(root: string): FileSystem {
  const target = (path: string) => {
    const absolute = resolve(root, path);
    const rel = relative(root, absolute);
    if (rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) {
      throw new Error('Fixture path escapes its root');
    }
    return absolute;
  };
  return {
    readFile: (path, encoding) => fs.readFile(target(path), encoding),
    writeFile: (path, content) => fs.writeFile(target(path), content, 'utf8'),
    exists: async path => { try { await fs.access(target(path)); return true; } catch { return false; } },
    mkdir: async (path, options) => { await fs.mkdir(target(path), options); },
    readdir: path => fs.readdir(target(path)),
    stat: path => fs.stat(target(path)),
  };
}

const spec = { $schemaVersion: SCHEMA_VERSION, kind: 'feature' as const,
  id: featureId('SYNC-IO'), title: 'Synchronisation', priority: Priority.High, acs: [] };

@FeatureTest(QualificationInfrastructureFeature)
class RealFilesystemTests {
@Verifies<QualificationInfrastructureFeature>('synchronizesRealFilesystemIdempotently')
async synchronizesUnicodeIdempotently() {
  const dir = await fs.mkdtemp(join(tmpdir(), 'rac-sync-'));
  const port = filesystem(dir);
  const path = 'requirements/features/panier.ts';
  try {
    const contents = new Map([[path, '// Éligibilité du panier\n']]);
    const plan = await diffSpecToDisk(spec, contents, port);
    expect(plan.entries[0]?.status).toBe('create');
    await applySyncPlan(plan, port, { mode: 'dry-run' });
    await expect(fs.access(join(dir, path))).rejects.toMatchObject({ code: 'ENOENT' });
    await applySyncPlan(plan, port, { mode: 'all' });
    expect(await fs.readFile(join(dir, path), 'utf8')).toBe(contents.get(path));
    const second = await diffSpecToDisk(spec, contents, port);
    expect(second.entries[0]?.status).toBe('unchanged');
    expect((await applySyncPlan(second, port, { mode: 'all' })).applied).toEqual([]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

@Verifies<QualificationInfrastructureFeature>('refusesUnsafeFilesystemPlans')
async rejectsUnsafePlansBeforeWriting() {
  const dir = await fs.mkdtemp(join(tmpdir(), 'rac-sync-reject-'));
  try {
    const entries = ['requirements/features/safe.ts', 'requirements/features/../../human.ts']
      .map(path => ({ path, status: 'create' as const, proposed: 'unexpected', current: null, hunks: [] }));
    await expect(applySyncPlan({ spec, entries }, filesystem(dir), { mode: 'all' }))
      .rejects.toBeInstanceOf(RefusedWriteError);
    expect(await fs.readdir(dir)).toEqual([]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
}
void RealFilesystemTests;
