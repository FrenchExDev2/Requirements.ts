/** Collect real runner artifacts for one platform; missing stages remain missing evidence. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readQualificationInventory, adaptQualificationTests, adaptQualificationStrategy, adaptQualificationCoverage, adaptQualificationMutation } from '../packages/requirements-compliance/dist/index.js';

/** Retain the actual runner inputs and outputs without starting or retrying a campaign. */
export async function collectQualificationEvidence(operation, runId, { root = fileURLToPath(new URL('../', import.meta.url)) } = {}) {
  root = resolve(root);
  if (!['begin', 'finish'].includes(operation) || !runId || !/^[\w-]+$/.test(runId)) throw new Error('Usage: collect-qualification-evidence.mjs begin|finish <run-id>');
  if (!['win32', 'linux'].includes(process.platform)) throw new Error('Complete qualification supports Windows and Linux.');
  const directory = resolve(root, 'test-results', runId);
  const require = createRequire(import.meta.url);
  async function toolVersions() {
    const tools = { node: process.version };
    for (const [key, name] of Object.entries({ typescript: 'typescript', vitest: 'vitest', stryker: '@stryker-mutator/core' })) tools[key] = JSON.parse(await readFile(require.resolve(`${name}/package.json`), 'utf8')).version;
    return tools;
  }
  async function retainBuild(stage, capture) {
    const archive = resolve(directory, stage), hashes = {}, artifacts = {};
    const visit = async dir => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) { await visit(full); continue; }
        if (!entry.isFile()) continue;
        const bytes = await readFile(full);
        const source = relative(capture ? root : archive, full).replaceAll('\\', '/');
        const retained = capture ? resolve(archive, source) : full;
        if (capture) {
          await mkdir(dirname(retained), { recursive: true });
          await writeFile(retained, bytes, { encoding: 'utf8', flag: 'wx' });
        }
        const hash = createHash('sha256').update(bytes).digest('hex');
        hashes[source] = hash;
        artifacts[relative(root, retained).replaceAll('\\', '/')] = hash;
      }
    };
    if (capture) {
      for (const pkg of await readdir(resolve(root, 'packages'), { withFileTypes: true })) if (pkg.isDirectory()) {
        try { await visit(resolve(root, 'packages', pkg.name, 'dist')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    } else {
      try { await visit(archive); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return { hashes, artifacts };
  }
  await mkdir(directory, { recursive: true });
  const inventory = await readQualificationInventory(root);
  const marker = resolve(directory, 'inputs-before.json');
  if (operation === 'begin') {
    const build = await retainBuild('build-before', true), tools = await toolVersions();
    await writeFile(marker, JSON.stringify({ schemaVersion: 1, runId, platform: process.platform, projectRoot: root, startedAt: new Date().toISOString(), hashes: inventory.hashes, buildHashes: build.hashes, tools }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    return { runId, platform: process.platform, inputs: Object.keys(inventory.hashes).length };
  } else {
    const before = JSON.parse(await readFile(marker, 'utf8'));
    if (before.runId !== runId || before.platform !== process.platform) throw new Error('Snapshot campaign/platform mismatch.');
    const buildBefore = await retainBuild('build-before', false), buildAfter = await retainBuild('build-after', true);
    const artifacts = { ...buildBefore.artifacts, ...buildAfter.artifacts }, tests = [], coverage = {}, mutationFiles = {}, strategies = [];
    const addArtifact = async file => {
      const key = relative(root, file).replaceAll('\\', '/');
      const bytes = await readFile(file);
      artifacts[key] = createHash('sha256').update(bytes).digest('hex');
      return JSON.parse(bytes.toString('utf8'));
    };
    const optional = async file => { try { return await addArtifact(file); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } };
    await addArtifact(marker);
    for (const name of ['Invoke-Audit.snapshot.ps1', 'Watch-Audit.ps1']) {
      const file = resolve(directory, name);
      try { artifacts[relative(root, file).replaceAll('\\', '/')] = createHash('sha256').update(await readFile(file)).digest('hex'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const entry of await readdir(resolve(root, 'packages'), { withFileTypes: true })) if (entry.isDirectory()) {
      const packageRoot = resolve(root, 'packages', entry.name);
      const output = resolve(packageRoot, 'test-results', runId);
      for (const name of ['tests.json', 'smoke-tests.json']) {
        const report = await optional(resolve(output, name));
        if (report) tests.push(...adaptQualificationTests(report, root, inventory));
      }
      const summary = await optional(resolve(output, 'coverage/coverage-summary.json'));
      if (summary) for (const [file, counters] of Object.entries(adaptQualificationCoverage(summary, root))) {
        if (file.startsWith(`packages/${entry.name}/`)) coverage[file] = counters;
      }
      const mutants = await optional(resolve(directory, 'mutation', entry.name, 'mutation-report.json'));
      if (mutants) for (const [file, statuses] of Object.entries(adaptQualificationMutation(mutants, root))) {
        const key = file.startsWith('packages/') ? file : `packages/${entry.name}/${file}`;
        mutationFiles[key] = statuses;
      }
    }
    const integration = await optional(resolve(directory, 'integration-tests.json'));
    if (integration) tests.push(...adaptQualificationTests(integration, root, inventory));
    const completeTests = await optional(resolve(directory, 'qualification-tests.json'));
    if (completeTests) tests.push(...adaptQualificationTests(completeTests, root, inventory));
    const fullCoverage = await optional(resolve(directory, 'coverage/coverage-summary.json'));
    if (fullCoverage) Object.assign(coverage, adaptQualificationCoverage(fullCoverage, root));
    const fullMutation = await optional(resolve(directory, 'mutation/mutation-report.json'));
    if (fullMutation) Object.assign(mutationFiles, adaptQualificationMutation(fullMutation, root));
    try {
      for (const file of await readdir(resolve(directory, 'strategies'))) if (file.endsWith('.json')) strategies.push(adaptQualificationStrategy(await addArtifact(resolve(directory, 'strategies', file)), inventory));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const state = await optional(resolve(directory, 'summary.json'));
    const check = name => state?.Runs?.find(row => row.Name === name)?.State === 'Success' ? 'passed' : 'missing';
    const actualMutationConfiguration = require(resolve(root, 'stryker.qualification.conf.cjs'));
    const mutationPolicy = { ignoreStatic: actualMutationConfiguration.ignoreStatic, incremental: actualMutationConfiguration.incremental };
    const policyPath = resolve(directory, 'mutation-policy.json');
    await writeFile(policyPath, JSON.stringify(mutationPolicy, null, 2) + '\n', 'utf8');
    await addArtifact(policyPath);
    const tools = await toolVersions();
    const toolsPath = resolve(directory, 'tool-versions.json');
    await writeFile(toolsPath, JSON.stringify(tools, null, 2) + '\n', 'utf8');
    await addArtifact(toolsPath);
    const evidence = { schemaVersion: 1, runId, platform: process.platform, projectRoot: root, startedAt: before.startedAt, completedAt: new Date().toISOString(),
      state: state?.Done && state.Runs.every(row => row.State === 'Success') ? 'complete' : 'interrupted',
      hashesBefore: before.hashes, hashesAfter: inventory.hashes, buildHashesBefore: before.buildHashes, buildHashesAfter: buildAfter.hashes, artifacts, toolsBefore: before.tools, tools, tests, coverage, strategies,
      mutation: { staticMutants: mutationPolicy?.ignoreStatic === false, incremental: mutationPolicy?.incremental !== false, files: mutationFiles },
      checks: { typecheck: check('test-types'), distribution: check('distribution'), orchestration: completeTests?.success ? check('qualification-tests') : check('integration') },
    };
    const file = resolve(directory, `evidence-${process.platform}.json`);
    await writeFile(file, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    return { file, state: evidence.state, tests: tests.length, coverageFiles: Object.keys(coverage).length, mutantFiles: Object.keys(mutationFiles).length, strategyRuns: strategies.length };
}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await collectQualificationEvidence(...process.argv.slice(2))));
}
