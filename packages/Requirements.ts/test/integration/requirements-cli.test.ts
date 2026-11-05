import { expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { CliDispatchContractsFeature } from '../../packages/requirements-requirements/src/cli-contracts.js';
import { createRequirementsProgram, main } from '../../packages/requirements/src/bin/requirements.js';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-shared-kernel/types';
import { contentHashOf } from '../../packages/requirements-versioning/src/versioning.js';

class RequestedExit extends Error { constructor(readonly exitCode: number) { super(`Exit ${exitCode}`); } }

async function withProject(work: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'rac-cli-é-'));
  try {
    for (const directory of ['requirements/features', 'requirements/requirements', 'test/unit', 'src']) await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, 'requirements.config.json'), JSON.stringify({ testDirs: ['test/unit'], includeScopes: ['src/'] }), 'utf8');
    await writeFile(join(root, 'src/cart.ts'), 'export function accepts(){return true}', 'utf8');
    await writeFile(join(root, 'requirements/requirements/cart.ts'), `
import {Requirement,Priority} from '@frenchexdev2/requirements';
export abstract class CartRequirement extends Requirement {
 readonly id='REQ-CART'; readonly title='Accept entries'; readonly status='Approved' as const;
 readonly priority=Priority.Critical; readonly kind='Functional' as const;
 readonly statement={pattern:'ubiquitous' as const,response:'Accept entries.'};
 readonly rationale={claim:'Entries need storage.',kind:'principle' as const,evidence:[]};
 readonly fitCriteria=[{kind:'unit-test' as const,describes:'Accept entries.',binds:['accepts']}];
 readonly verificationMethod='Test' as const; readonly source={type:'stakeholder' as const,role:'user',date:'2026-11-03'};
 readonly risk={level:'Low' as const,ifNotMet:'Entries are lost.'};
}`, 'utf8');
    await writeFile(join(root, 'requirements/features/cart.ts'), `
import {Feature,Priority,Satisfies,type ACResult} from '@frenchexdev2/requirements';
import {CartRequirement} from '../requirements/cart.js';
@Satisfies(CartRequirement) export abstract class CartFeature extends Feature {
 readonly id='CART'; readonly title='Cart'; readonly priority=Priority.Critical;
 abstract accepts(): ACResult;
 abstract rejects(): ACResult; // expects: e2e
}`, 'utf8');
    await writeFile(join(root, 'test/unit/cart.test.ts'), `
import {FeatureTest,Verifies} from '@frenchexdev2/requirements'; import {accepts} from '../../src/cart.js';
@FeatureTest(CartFeature) class CartTests { @Verifies<CartFeature>('accepts') accepts(){expect(accepts()).toBe(true)} }
`, 'utf8');
    await work(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function execute(root: string, args: string[], startup = false) {
  const out: string[] = [], err: string[] = [];
  const previousCode = process.exitCode;
  process.exitCode = 0;
  const mocks = [
    vi.spyOn(process, 'cwd').mockReturnValue(root),
    vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => { out.push(values.map(String).join(' ')); }),
    vi.spyOn(console, 'error').mockImplementation((...values: unknown[]) => { err.push(values.map(String).join(' ')); }),
    vi.spyOn(process.stdout, 'write').mockImplementation((value: string | Uint8Array) => { out.push(String(value)); return true; }),
    vi.spyOn(process.stderr, 'write').mockImplementation((value: string | Uint8Array) => { err.push(String(value)); return true; }),
    vi.spyOn(process, 'exit').mockImplementation(code => { throw new RequestedExit(Number(code ?? 0)); }),
  ];
  let error: unknown;
  try {
    if (startup) await main(['node', 'requirements', ...args]);
    else await createRequirementsProgram().exitOverride().parseAsync(['node', 'requirements', ...args]);
  } catch (caught) { error = caught; }
  const code = error && typeof error === 'object' && 'exitCode' in error ? Number(error.exitCode) : error ? 1 : Number(process.exitCode ?? 0);
  for (const mock of mocks) mock.mockRestore();
  process.exitCode = previousCode;
  return { out: out.join('\n'), err: err.join('\n'), code, error };
}

@FeatureTest(CliDispatchContractsFeature, { timeout: 120_000 })
class RequirementsCliContractTests {
  @Verifies<CliDispatchContractsFeature>('commandTreesAreIndependentAndAwaitActions')
  async commandTreesAreIndependentAndAwaitActions() {
    expect(createRequirementsProgram()).not.toBe(createRequirementsProgram());
    await withProject(async root => {
      const help = await execute(root, ['--help']);
      expect(help.code).toBe(0);
      for (const command of ['qualify', 'trace', 'compliance', 'feature', 'requirement', 'schema', 'watch']) expect(help.out).toContain(command);
      const normal = await execute(root, ['trace', 'gaps', '--json'], true);
      const separated = await execute(root, ['--', 'trace', 'gaps', '--json'], true);
      expect(normal.error).toBeUndefined();
      expect(JSON.parse(separated.out)).toEqual(JSON.parse(normal.out));
    });
  }

  @Verifies<CliDispatchContractsFeature>('qualificationRefusesMissingEvidence')
  async qualificationRefusesMissingEvidence() {
    await withProject(async root => {
      const json = await execute(root, ['qualify', '--strict', '--json']);
      expect(json.code).toBe(1);
      expect(JSON.parse(json.out)).toMatchObject({ mode: 'qualification', state: 'failed', complete: false });
      const text = await execute(root, ['qualify', '--strict']);
      expect(text.code).toBe(1);
      expect(text.out).toContain('missing-platform');
    });
  }

  @Verifies<CliDispatchContractsFeature>('traceQueriesResolveAndReportMissingTargets')
  async traceQueriesResolveAndReportMissingTargets() {
    await withProject(async root => {
      for (const args of [['trace', 'gaps'], ['trace', 'matrix', 'CART'], ['trace', 'chain', 'CART', 'accepts']]) {
        const text = await execute(root, args);
        expect(text.error).toBeUndefined(); expect(text.out).toContain('CART');
        const json = await execute(root, [...args, '--json']);
        expect(json.error).toBeUndefined(); expect(JSON.parse(json.out)).toBeTypeOf('object');
      }
      for (const args of [['trace', 'matrix', 'ABSENT'], ['trace', 'chain', 'CART', 'absent']]) {
        const result = await execute(root, args);
        expect(result.code).toBe(1); expect(result.err).toContain('not found');
      }
      expect((await execute(root, ['trace', 'explain', 'invalid'])).error).toMatchObject({ message: 'Expected file:line' });
    });
  }

  @Verifies<CliDispatchContractsFeature>('staticComplianceRemainsDistinctFromQualification')
  async staticComplianceRemainsDistinctFromQualification() {
    await withProject(async root => {
      for (const args of [['compliance', '--json'], ['compliance', '--by-test', '--json'], ['compliance', '--by-test'], ['compliance', '--no-orphans', '--no-bindings']]) {
        const result = await execute(root, args);
        expect(result.error).toBeUndefined(); expect(result.out.length).toBeGreaterThan(0);
        expect(result.out).not.toContain('"complete": true');
        if (args.includes('--json')) expect(JSON.parse(result.out).mode).toBe('static-analysis');
        else expect(result.out).toContain('Static compliance analysis');
      }
      const strict = await execute(root, ['compliance', '--strict']);
      expect(strict.code).toBe(1); expect(strict.err).toContain('Critical ACs uncovered');
      const save = await execute(root, ['compliance', '--save', '--infer', '--date', 'fixture']);
      expect(save.error).toBeUndefined(); expect(save.out).toContain('Saved compliance report');
      const files = await readdir(join(root, 'docs/compliance'));
      expect(files.length).toBe(1);
      expect(JSON.parse(await readFile(join(root, 'docs/compliance', files[0]!), 'utf8'))).toBeTypeOf('object');
      expect(save.err).toContain('inferred manifest');
    });
  }

  @Verifies<CliDispatchContractsFeature>('graphOutputsFollowExplicitFormatAndDestination')
  async graphOutputsFollowExplicitFormatAndDestination() {
    await withProject(async root => {
      const mermaid = await execute(root, ['trace', 'graph']);
      expect(mermaid.error).toBeUndefined(); expect(mermaid.out).toContain('flowchart'); expect(mermaid.out).toContain('CART');
      const dot = await execute(root, ['trace', 'graph', '--format', 'dot', '--output', 'graph.dot']);
      expect(dot.error).toBeUndefined(); expect(dot.err).toContain('Wrote graph.dot');
      expect(await readFile(join(root, 'graph.dot'), 'utf8')).toContain('digraph');
      expect((await execute(root, ['trace', 'graph', '--format', 'invalid'])).code).toBe(1);
    });
  }

  @Verifies<CliDispatchContractsFeature>('scaffoldingPreservesAlreadyCoveredAcs')
  async scaffoldingPreservesAlreadyCoveredAcs() {
    await withProject(async root => {
      const unit = await execute(root, ['scaffold', 'test', 'CART']);
      expect(unit.error).toBeUndefined(); expect(unit.out).toContain('No uncovered unit ACs');
      const preview = await execute(root, ['scaffold', 'e2e', 'CART', '--dry-run']);
      expect(preview.error).toBeUndefined(); expect(preview.out).toContain('dry run'); expect(preview.out).toContain('rejects');
      const write = await execute(root, ['scaffold', 'e2e', 'CART']);
      expect(write.error).toBeUndefined(); expect(write.out).toContain('Wrote:');
      expect((await execute(root, ['scaffold', 'test', 'ABSENT'])).code).toBe(1);
    });
  }

  @Verifies<CliDispatchContractsFeature>('versionPinDriftBlocksStrictAnalysisWithinBudget')
  async versionPinDriftBlocksStrictAnalysisWithinBudget() {
    await withProject(async root => {
      await mkdir(join(root, 'test/e2e'), { recursive: true });
      await writeFile(join(root, 'test/e2e/cart.test.ts'), `import {accepts} from '../../src/cart.js'; @FeatureTest(CartFeature) class CartE2e { @Verifies<CartFeature>('rejects') rejects(){expect(accepts()).toBe(true)} }`, 'utf8');
      const requirement = {
        $schemaVersion: SCHEMA_VERSION, kind: 'requirement' as const, id: 'REQ-CART', title: 'Accept entries', priority: 'critical', status: 'Approved', requirementKind: 'Functional',
        statement: { pattern: 'ubiquitous', response: 'Accept entries.' }, rationale: { kind: 'principle', claim: 'Entries need storage.', evidence: [] },
        fitCriteria: [{ kind: 'unit-test', describes: 'Accept entries.', binds: ['accepts'] }], verificationMethod: 'Test',
        source: { type: 'stakeholder', role: 'user', date: '2026-11-03' }, risk: { level: 'Low', ifNotMet: 'Entries are lost.' }, satisfiedBy: ['CART'],
      };
      // The fixture is serialized JSON; loadAllSpecs validates its branded fields in the CLI.
      const hash = contentHashOf(requirement as unknown as Parameters<typeof contentHashOf>[0]);
      await writeFile(join(root, 'requirements/requirements/cart.spec.json'), JSON.stringify({ ...requirement, version: { version: 2, contentHash: hash, since: '2026-11-03' } }), 'utf8');
      await writeFile(join(root, 'requirements/features/cart.spec.json'), JSON.stringify({ $schemaVersion: SCHEMA_VERSION, kind: 'feature', id: 'CART', title: 'Cart', priority: 'critical', satisfies: ['REQ-CART'], acs: [{ name: 'accepts', expects: ['unit'] }, { name: 'rejects', expects: ['e2e'] }] }), 'utf8');
      const config = async (pins?: unknown) => writeFile(join(root, 'requirements.config.json'), JSON.stringify({ testDirs: ['test/unit', 'test/e2e'], versionPins: pins }), 'utf8');
      const valid = { featureId: 'CART', targetId: 'REQ-CART', pinnedVersion: 2, pinnedHash: hash };
      const started = performance.now();
      await config();
      const unpinned = await execute(root, ['compliance', '--strict', '--json']);
      expect(unpinned.code, unpinned.err).toBe(0);
      expect(unpinned.err).toContain('without a pin');
      await config([valid]);
      expect((await execute(root, ['compliance', '--strict', '--json'])).code).toBe(0);
      for (const pinnedVersion of [1, 2]) {
        await config([{ targetId: 'REQ-CART', pinnedVersion, pinnedHash: 'sha256:' + 'a'.repeat(64) }]);
        const stale = await execute(root, ['compliance', '--strict', '--json']);
        expect(stale.code).toBe(1); expect(stale.err).toContain('version-drift');
      }
      const invalidPins: unknown[] = ['invalid', [null], [{}], [{ ...valid, targetId: 'ABSENT' }], [{ ...valid, featureId: 'ABSENT' }], [{ ...valid, featureId: 1 }], [{ ...valid, targetId: 1 }], [{ ...valid, pinnedHash: 1 }], [{ ...valid, pinnedHash: 'x' }], [{ ...valid, pinnedHash: 'x' + hash }], [{ ...valid, pinnedHash: hash + 'x' }], [{ ...valid, pinnedVersion: 0 }], [{ ...valid, pinnedVersion: 1.5 }], [valid, valid]];
      for (const pins of invalidPins) {
        await config(pins);
        const rejected = await execute(root, ['compliance', '--strict', '--json']);
        expect(rejected.code, JSON.stringify(pins)).toBe(1);
        expect(rejected.error).toBeInstanceOf(Error);
        expect((rejected.error as Error).message).toMatch(/pin/i);
      }
      expect(performance.now() - started).toBeLessThanOrEqual(60_000);
    });
  }
}
void RequirementsCliContractTests;
