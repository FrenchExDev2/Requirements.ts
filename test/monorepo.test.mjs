import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('one root workspace discovers both projects without including recursive project roots', async () => {
  const manifest = await json('package.json');
  assert.equal(manifest.private, true);
  const workspace = await readFile(new URL('pnpm-workspace.yaml', root), 'utf8');
  assert.match(workspace, /- packages\/Requirements\.ts\/packages\/\*/);
  assert.match(workspace, /- packages\/Requirements\.SharedKernel\.ts\/packages\/\*/);
  assert.doesNotMatch(workspace, /- (?:Requirements\.ts|Requirements\.SharedKernel\.ts)\s*$/m);
  const names = new Set();
  for (const project of ['packages/Requirements.ts', 'packages/Requirements.SharedKernel.ts']) {
    const directories = await readdir(new URL(`${project}/packages/`, root), { withFileTypes: true });
    for (const directory of directories.filter(entry => entry.isDirectory())) {
      const pkg = await json(`${project}/packages/${directory.name}/package.json`);
      assert.ok(!names.has(pkg.name), `Duplicate package: ${pkg.name}`);
      names.add(pkg.name);
    }
  }
  assert.ok(names.has('@frenchexdev2/requirements'));
  assert.ok(names.has('@frenchexdev2/requirements-shared-kernel'));
});

test('shared-kernel consumers resolve the moved workspace instead of a registry copy', async () => {
  const directories = await readdir(new URL('packages/Requirements.ts/packages/', root), { withFileTypes: true });
  let consumers = 0;
  for (const entry of directories.filter(entry => entry.isDirectory())) {
    const pkg = await json(`packages/Requirements.ts/packages/${entry.name}/package.json`);
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const dependency = pkg[section]?.['@frenchexdev2/requirements-shared-kernel'];
      if (dependency) {
        consumers++;
        assert.equal(dependency, 'workspace:^', `${pkg.name}.${section}`);
      }
    }
  }
  assert.ok(consumers > 0);
  await access(new URL('packages/Requirements.SharedKernel.ts/packages/requirements-shared-kernel/src/index.ts', root));
});

test('development profile keeps external CodeGenerationPipeline at its unchanged sibling location', async () => {
  const production = await readFile(new URL('pnpm-workspace.yaml', root), 'utf8');
  const development = await readFile(new URL('pnpm-workspace.dev.yaml', root), 'utf8');
  assert.doesNotMatch(production, /\b(?:link|file|portal):/);
  assert.match(development, /link:\.\.\/CodeGenerationPipeline\.ts\/packages\/ts-codegen-pipeline/);
  assert.doesNotMatch(development, /requirements-shared-kernel.*link:/);
  await access(new URL('../CodeGenerationPipeline.ts/packages/ts-codegen-pipeline/package.json', root));
});

test('project roots live under packages and release discovery reaches every leaf package', async () => {
  const { loadWorkspace, checkRelease } = await import('../scripts/release.mjs');
  const { fileURLToPath } = await import('node:url');
  const workspace = await loadWorkspace(fileURLToPath(root));
  assert.equal(workspace.packages.length, 17);
  assert.ok(workspace.packages.every(pkg => pkg.directory.replaceAll('\\', '/').includes('/packages/')));
  assert.ok(workspace.packages.some(pkg => pkg.manifest.name === '@frenchexdev2/requirements-shared-kernel'));
  const release = await checkRelease(fileURLToPath(root), 'requirements-shared-kernel/v0.1.0');
  assert.deepEqual(release.packages, ['@frenchexdev2/requirements-shared-kernel']);
  for (const project of ['Requirements.ts', 'Requirements.SharedKernel.ts']) {
    await assert.rejects(access(new URL(`${project}/package.json`, root)), { code: 'ENOENT' });
    await access(new URL(`packages/${project}/package.json`, root));
  }
});
