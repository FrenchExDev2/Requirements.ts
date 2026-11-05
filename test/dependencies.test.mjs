import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { checkProduction, installProfile, recoverProfile } from '../scripts/dependencies.mjs';

const production = 'packages:\n  - packages/*\n# Production: café\n';
const development = `${production}overrides:\n  '@example/kernel': link:../Kernel\n`;
const registryLock = "lockfileVersion: '9.0'\nimporters:\n  packages/app:\n    dependencies:\n      '@example/core':\n        specifier: workspace:*\n        version: link:../core\n";
const developmentLock = "lockfileVersion: '9.0'\noverrides:\n  '@example/kernel': link:../Kernel\n";

async function fixture(t, withProductionLock = true) {
  const root = await mkdtemp(join(tmpdir(), 'pnpm-profiles-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = (path, text) => writeFile(join(root, path), text, 'utf8');
  const get = path => readFile(join(root, path), 'utf8');
  await put('pnpm-workspace.yaml', production);
  await put('pnpm-workspace.dev.yaml', development);
  if (withProductionLock) await put('pnpm-lock.yaml', registryLock);
  await put('pnpm-lock.dev.yaml', developmentLock);
  return { root, put, get };
}

test('development installs see local links and save only the development lockfile', async t => {
  const { root, get, put } = await fixture(t);
  await installProfile(root, 'dev', [], async (directory, options) => {
    assert.equal(directory, root);
    assert.deepEqual(options, ['--frozen-lockfile']);
    assert.equal(await get('pnpm-workspace.yaml'), development);
    assert.equal(await get('pnpm-lock.yaml'), developmentLock);
    await put('pnpm-lock.yaml', `${developmentLock}# Updated development resolution\n`);
  }, {});
  assert.equal(await get('pnpm-workspace.yaml'), production);
  assert.equal(await get('pnpm-lock.yaml'), registryLock);
  assert.match(await get('pnpm-lock.dev.yaml'), /Updated development resolution/);
  await assert.rejects(get('.pnpm-profile.json'), { code: 'ENOENT' });
});

test('failed development installs restore exact production bytes and preserve the old dev lock', async t => {
  const { root, get, put } = await fixture(t);
  await assert.rejects(installProfile(root, 'dev', [], async () => {
    await put('pnpm-lock.yaml', 'incomplete installation');
    throw new Error('Network failure');
  }, {}), /Network failure/);
  assert.equal(await get('pnpm-workspace.yaml'), production);
  assert.equal(await get('pnpm-lock.yaml'), registryLock);
  assert.equal(await get('pnpm-lock.dev.yaml'), developmentLock);
  await assert.rejects(get('.pnpm-profile.json'), { code: 'ENOENT' });
});

test('development restores the absence of a production lockfile during bootstrap', async t => {
  const { root, get } = await fixture(t, false);
  await installProfile(root, 'dev', [], async () => {}, {});
  assert.equal(await get('pnpm-workspace.yaml'), production);
  await assert.rejects(get('pnpm-lock.yaml'), { code: 'ENOENT' });
});

test('development is rejected in CI before any installation or mutation', async t => {
  const { root, get } = await fixture(t);
  for (const environment of [{ CI: 'true' }, { CI: '1' }, { GITHUB_ACTIONS: 'true' }]) {
    await assert.rejects(installProfile(root, 'dev', [], () => assert.fail('Must not install'), environment), /forbidden in CI/);
  }
  assert.equal(await get('pnpm-workspace.yaml'), production);
  assert.equal(await get('pnpm-lock.yaml'), registryLock);
});

test('production generation retains its new registry lock and never reads the dev profile', async t => {
  const { root, get, put } = await fixture(t, false);
  await rm(join(root, 'pnpm-workspace.dev.yaml'));
  await installProfile(root, 'prod', ['--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'], async () => {
    assert.equal(await get('pnpm-workspace.yaml'), production);
    await put('pnpm-lock.yaml', registryLock);
  });
  await checkProduction(root);
  assert.equal(await get('pnpm-lock.yaml'), registryLock);
  assert.equal(await get('pnpm-lock.dev.yaml'), developmentLock);
});

test('production check accepts internal workspace links but rejects external local inputs', async t => {
  const { root, put } = await fixture(t);
  await checkProduction(root);
  for (const transport of ['link:', 'file:', 'portal:']) {
    await put('pnpm-workspace.yaml', `${production}overrides:\n  external: ${transport}../external\n`);
    await assert.rejects(checkProduction(root), /workspace contains local/);
    await put('pnpm-workspace.yaml', production);
    await put('pnpm-lock.yaml', `lockfileVersion: '9.0'\noverrides:\n  external: ${transport}../external\n`);
    await assert.rejects(checkProduction(root), /lockfile contains local/);
    await put('pnpm-lock.yaml', `importers:\n  .:\n    dependencies:\n      external:\n        specifier: '${transport}../external'\n`);
    await assert.rejects(checkProduction(root), /lockfile contains local/);
  }
  await rm(join(root, 'pnpm-lock.yaml'));
  await assert.rejects(checkProduction(root), /Production pnpm-lock.yaml is missing/);
});

test('an existing transaction prevents concurrent installs without altering its journal', async t => {
  const { root, put, get } = await fixture(t);
  await put('.pnpm-profile.json', 'Another installation owns this file');
  await assert.rejects(installProfile(root, 'dev', [], () => assert.fail('Must not install'), {}), /active or interrupted/);
  assert.equal(await get('pnpm-workspace.yaml'), production);
  assert.equal(await get('.pnpm-profile.json'), 'Another installation owns this file');
});

test('unsafe or contradictory install arguments are rejected before mutation', async t => {
  const { root, get } = await fixture(t);
  for (const options of [['publish'], ['--lockfile-dir=elsewhere'], ['--frozen-lockfile', '--no-frozen-lockfile']]) {
    await assert.rejects(installProfile(root, 'dev', options, () => assert.fail('Must not install'), {}), /Unsupported|Conflicting/);
  }
  assert.equal(await get('pnpm-workspace.yaml'), production);
});

test('recovery refuses to overwrite an installation whose owner is alive', async t => {
  const { root, put, get } = await fixture(t);
  await put('.pnpm-profile.json', JSON.stringify({ pid: process.pid, profile: 'dev' }));
  await assert.rejects(recoverProfile(root), /still running/);
  assert.equal(await get('pnpm-workspace.yaml'), production);
});

test('an interrupted dev transaction can restore its production snapshots', async t => {
  const { root, put, get } = await fixture(t);
  // This PID exceeds platform PID limits; no process is launched or terminated.
  await put('.pnpm-profile.json', JSON.stringify({ pid: 2147483647, profile: 'dev',
    workspace: Buffer.from(production).toString('base64'), lockfile: Buffer.from(registryLock).toString('base64') }));
  await put('pnpm-workspace.yaml', development);
  await put('pnpm-lock.yaml', developmentLock);
  await recoverProfile(root);
  assert.equal(await get('pnpm-workspace.yaml'), production);
  assert.equal(await get('pnpm-lock.yaml'), registryLock);
  await assert.rejects(get('.pnpm-profile.json'), { code: 'ENOENT' });
});

test('committed profiles share settings and disable implicit installs before profile selection', async () => {
  const root = new URL('../', import.meta.url);
  const prod = await readFile(new URL('pnpm-workspace.yaml', root), 'utf8');
  const dev = await readFile(new URL('pnpm-workspace.dev.yaml', root), 'utf8');
  assert.match(prod, /^verifyDepsBeforeRun: false$/m);
  assert.match(dev, /link:/);
  assert.doesNotMatch(prod, /\b(?:link|file|portal):/);
  const normalize = text => text.split(/\r?\n/).filter(line => line.trim() && !/^\s*#/.test(line)
    && !/^  ['"]@frenchexdev2\/.+: ['"]link:/.test(line)).join('\n');
  assert.equal(normalize(prod), normalize(dev), 'Catalogs and shared settings must agree');
});

test('failed production generation preserves the previous registry lockfile', async t => {
  const { root, get, put } = await fixture(t);
  await assert.rejects(installProfile(root, 'prod', ['--lockfile-only'], async () => {
    await put('pnpm-lock.yaml', 'incomplete registry resolution');
    throw new Error('Package not published');
  }), /Package not published/);
  assert.equal(await get('pnpm-workspace.yaml'), production);
  assert.equal(await get('pnpm-lock.yaml'), registryLock);
  assert.equal(await get('pnpm-lock.dev.yaml'), developmentLock);
});
