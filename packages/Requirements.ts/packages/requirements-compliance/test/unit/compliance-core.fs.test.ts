import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ComplianceCoreFeature } from '@frenchexdev2/requirements-requirements';
import {
  readFeatures,
  findLatestCoverageSummary,
  loadCoverageSummary,
  parseRequirementSource,
  readRequirements,
  deriveTraceabilityCorpus,
  type FeatureMeta,
  type RequirementMeta,
} from '../../src/compliance-core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function withTmpDir(fn: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'req-pkg-test-'));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

const FEATURE_SRC = (className: string, id = className) => `
import { Feature, Priority } from './base';
export abstract class ${className} extends Feature {
  readonly id = '${id}';
  readonly title = '${id}';
  readonly priority = Priority.Medium;
  abstract noop(): unknown;
}
`;

@FeatureTest(ComplianceCoreFeature)
class ReadFeaturesTests {
  @Verifies<ComplianceCoreFeature>('readFeaturesParsesAllTsFiles')
  async 'parses every .ts file under the directory in parallel'() {
    await withTmpDir(async dir => {
      await fs.writeFile(path.join(dir, 'a.ts'), FEATURE_SRC('AlphaFeature'));
      await fs.writeFile(path.join(dir, 'b.ts'), FEATURE_SRC('BravoFeature'));
      const result = await readFeatures(dir);
      expect(result.map(f => f.className).sort()).toEqual(['AlphaFeature', 'BravoFeature']);
    });
  }

  @Verifies<ComplianceCoreFeature>('readFeaturesSkipsNonTsFiles')
  async 'ignores files that do not end in .ts'() {
    await withTmpDir(async dir => {
      await fs.writeFile(path.join(dir, 'feature.ts'), FEATURE_SRC('Real'));
      await fs.writeFile(path.join(dir, 'README.md'), '# not a feature');
      await fs.writeFile(path.join(dir, 'data.json'), '{}');
      const result = await readFeatures(dir);
      expect(result.map(f => f.className)).toEqual(['Real']);
    });
  }

  @Verifies<ComplianceCoreFeature>('readFeaturesFiltersOutNullParseResults')
  async 'drops .ts files that contain no Feature class'() {
    await withTmpDir(async dir => {
      await fs.writeFile(path.join(dir, 'good.ts'), FEATURE_SRC('GoodFeature'));
      await fs.writeFile(path.join(dir, 'noise.ts'), 'export const x = 1;');
      const result = await readFeatures(dir);
      expect(result.map(f => f.className)).toEqual(['GoodFeature']);
    });
  }

  @Verifies<ComplianceCoreFeature>('readFeaturesParsesAllTsFiles')
  async 'recurses into subdirectories and prepends subpath to file field'() {
    await withTmpDir(async dir => {
      await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
      await fs.mkdir(path.join(dir, 'sub', 'nested'), { recursive: true });
      await fs.writeFile(path.join(dir, 'top.ts'), FEATURE_SRC('TopFeature'));
      await fs.writeFile(path.join(dir, 'sub', 'middle.ts'), FEATURE_SRC('MidFeature'));
      await fs.writeFile(path.join(dir, 'sub', 'nested', 'deep.ts'), FEATURE_SRC('DeepFeature'));
      const result = await readFeatures(dir);
      const byClass = Object.fromEntries(result.map(r => [r.className, r.file]));
      expect(byClass.TopFeature).toBe('top.ts');
      expect(byClass.MidFeature).toBe('sub/middle.ts');
      expect(byClass.DeepFeature).toBe('sub/nested/deep.ts');
    });
  }
}

const SUMMARY = (entries: Record<string, number>): string => {
  const pcts = (n: number) => ({ total: 100, covered: n, skipped: 0, pct: n });
  const obj: Record<string, unknown> = { total: { lines: pcts(99) } };
  for (const [k, v] of Object.entries(entries)) {
    obj[k] = { lines: pcts(v), branches: pcts(v), functions: pcts(v), statements: pcts(v) };
  }
  return JSON.stringify(obj);
};

@FeatureTest(ComplianceCoreFeature)
class LoadCoverageSummaryTests {
  @Verifies<ComplianceCoreFeature>('loadCoverageSummarySkipsTotalKey')
  async 'skips the special "total" entry'() {
    await withTmpDir(async dir => {
      const f = path.join(dir, 'summary.json');
      await fs.writeFile(f, SUMMARY({ 'src/a.ts': 80 }));
      const map = await loadCoverageSummary(f, dir);
      expect(map.has('total')).toBe(false);
      expect(map.get('src/a.ts')!.lines).toBe(80);
    });
  }

  @Verifies<ComplianceCoreFeature>('loadCoverageSummaryExtractsAllPctMetrics')
  async 'extracts lines, branches, functions, statements percentages'() {
    await withTmpDir(async dir => {
      const f = path.join(dir, 'summary.json');
      const raw = JSON.stringify({
        'src/a.ts': {
          lines:      { pct: 90 },
          branches:   { pct: 80 },
          functions:  { pct: 70 },
          statements: { pct: 95 },
        },
      });
      await fs.writeFile(f, raw);
      const map = await loadCoverageSummary(f, dir);
      const e = map.get('src/a.ts')!;
      expect(e).toEqual({ lines: 90, branches: 80, functions: 70, statements: 95 });
    });
  }

  @Verifies<ComplianceCoreFeature>('loadCoverageSummaryNormalizesAllKeys')
  async 'normalizes absolute paths in keys to posix relative'() {
    await withTmpDir(async dir => {
      const f = path.join(dir, 'summary.json');
      const absKey = path.join(dir, 'src', 'a.ts');
      await fs.writeFile(f, SUMMARY({ [absKey]: 50 }));
      const map = await loadCoverageSummary(f, dir);
      expect([...map.keys()]).toEqual(['src/a.ts']);
    });
  }
}

@FeatureTest(ComplianceCoreFeature)
class FindLatestCoverageSummaryTests {
  @Verifies<ComplianceCoreFeature>('findLatestCoverageReturnsExplicitRunIdMatch')
  async 'returns the explicit runId path when its coverage-summary.json exists'() {
    await withTmpDir(async root => {
      const runId = '2026-04-14T00-00-00';
      const dir = path.join(root, 'test-results', runId, 'coverage');
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, 'coverage-summary.json');
      await fs.writeFile(file, '{}');
      const found = await findLatestCoverageSummary(root, runId);
      expect(found).not.toBeNull();
      expect(found!.runId).toBe(runId);
      expect(found!.file).toBe(file);
    });
  }

  @Verifies<ComplianceCoreFeature>('findLatestCoverageHandlesNestedUnitLayout')
  async 'finds coverage under unit/coverage/ subpath'() {
    await withTmpDir(async root => {
      const runId = '2026-04-14T00-00-00';
      const dir = path.join(root, 'test-results', runId, 'unit', 'coverage');
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, 'coverage-summary.json');
      await fs.writeFile(file, '{}');
      const found = await findLatestCoverageSummary(root, runId);
      expect(found!.file).toBe(file);
    });
  }

  @Verifies<ComplianceCoreFeature>('findLatestCoverageReturnsNullForExplicitRunIdWhenAbsent')
  async 'returns null when explicit runId has no coverage summary'() {
    await withTmpDir(async root => {
      await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
      const found = await findLatestCoverageSummary(root, '2026-04-14T00-00-00');
      expect(found).toBeNull();
    });
  }

  @Verifies<ComplianceCoreFeature>('findLatestCoverageReturnsNullWhenTestResultsMissing')
  async 'returns null when test-results directory does not exist'() {
    await withTmpDir(async root => {
      const found = await findLatestCoverageSummary(root);
      expect(found).toBeNull();
    });
  }

  @Verifies<ComplianceCoreFeature>('findLatestCoverageScansAllRunsWithoutRunId')
  async 'scans all ISO-shaped run dirs when no runId given'() {
    await withTmpDir(async root => {
      const r1 = '2026-04-14T00-00-00';
      const r2 = '2026-04-14T01-00-00';
      for (const r of [r1, r2]) {
        const d = path.join(root, 'test-results', r, 'coverage');
        await fs.mkdir(d, { recursive: true });
        await fs.writeFile(path.join(d, 'coverage-summary.json'), '{}');
      }
      const found = await findLatestCoverageSummary(root);
      expect(found!.runId).toBe(r2);
    });
  }

  @Verifies<ComplianceCoreFeature>('findLatestCoveragePicksNewestByLexSort')
  async 'picks the lexicographically newest runId'() {
    await withTmpDir(async root => {
      const earliest = '2026-01-01T00-00-00';
      const middle =   '2026-06-15T12-30-45';
      const latest =   '2026-12-31T23-59-59';
      for (const r of [middle, earliest, latest]) {
        const d = path.join(root, 'test-results', r, 'coverage');
        await fs.mkdir(d, { recursive: true });
        await fs.writeFile(path.join(d, 'coverage-summary.json'), '{}');
      }
      const found = await findLatestCoverageSummary(root);
      expect(found!.runId).toBe(latest);
    });
  }

  @Verifies<ComplianceCoreFeature>('findLatestCoverageIgnoresNonIsoDirs')
  async 'ignores directories that do not match the ISO timestamp pattern'() {
    await withTmpDir(async root => {
      const tr = path.join(root, 'test-results');
      // Two ISO dirs (one with summary), one non-ISO with summary that should be ignored
      const isoEmpty = '2026-04-14T00-00-00';
      const nonIso = 'random-dir';
      for (const r of [isoEmpty, nonIso]) {
        const d = path.join(tr, r, 'coverage');
        await fs.mkdir(d, { recursive: true });
        await fs.writeFile(path.join(d, 'coverage-summary.json'), '{}');
      }
      const found = await findLatestCoverageSummary(root);
      expect(found!.runId).toBe(isoEmpty);
    });
  }

  @Verifies<ComplianceCoreFeature>('findLatestCoverageReturnsNullWhenNoCandidates')
  async 'returns null when ISO dirs exist but none contain a summary'() {
    await withTmpDir(async root => {
      const d = path.join(root, 'test-results', '2026-04-14T00-00-00');
      await fs.mkdir(d, { recursive: true });
      const found = await findLatestCoverageSummary(root);
      expect(found).toBeNull();
    });
  }
}

const REQ_SRC = (className: string, id?: string) => `
import { Requirement, Priority } from '@frenchexdev2/requirements-core';
export abstract class ${className} extends Requirement {
  readonly id = ${id === undefined ? 'className as any' : `'${id}'`};
  readonly title = 't';
  readonly priority = Priority.Low;
  readonly status = 'Draft' as const;
  readonly kind = 'Functional' as const;
  readonly statement = { pattern: 'ubiquitous' as const, response: 'x' };
  readonly rationale = { claim: 'c', kind: 'principle' as const, evidence: [] };
  readonly fitCriteria = [];
  readonly verificationMethod = 'Test' as const;
  readonly source = { type: 'stakeholder' as const, role: 'r', date: '2026-01-01' };
  readonly risk = { level: 'Low' as const, ifNotMet: 'n' };
  readonly tracedTo = [];
}
`;

@FeatureTest(ComplianceCoreFeature)
class ParseRequirementSourceTests {
  @Verifies<ComplianceCoreFeature>('parseRequirementSourceExtractsClassNameAndIdFromStringLiteral')
  'returns {id, className, file} when source is an abstract exported Requirement with a string id'() {
    const src = `
      export abstract class AlphaReq extends Requirement {
        readonly id = 'REQ-ALPHA' as const;
      }
    `;
    const meta = parseRequirementSource(src, 'alpha.ts');
    expect(meta).toEqual({ id: 'REQ-ALPHA', className: 'AlphaReq', file: 'alpha.ts', status: '', refines: [] });
  }

  @Verifies<ComplianceCoreFeature>('parseRequirementSourceReadsRefinesDecorator')
  'reads the parent Requirement class names off the @Refines decorator'() {
    const src = `
      @Refines(RootReq)
      export abstract class LeafReq extends Requirement {
        readonly id = 'REQ-LEAF';
      }
    `;
    expect(parseRequirementSource(src, 'leaf.ts')!.refines).toEqual(['RootReq']);
  }

  @Verifies<ComplianceCoreFeature>('parseRequirementSourceReadsRefinesDecorator')
  'ignores a decorator that is not @Refines and yields no parents'() {
    const src = `
      @SomethingElse(RootReq)
      export abstract class LooseReq extends Requirement {
        readonly id = 'REQ-LOOSE';
      }
    `;
    expect(parseRequirementSource(src, 'loose.ts')!.refines).toEqual([]);
  }

  @Verifies<ComplianceCoreFeature>('parseRequirementSourceFallsBackToClassNameWhenNoIdField')
  'falls back to className when no id property is declared'() {
    const src = `
      export abstract class BetaReq extends Requirement {
        readonly title = 't';
      }
    `;
    const meta = parseRequirementSource(src, 'beta.ts');
    expect(meta).toEqual({ id: 'BetaReq', className: 'BetaReq', file: 'beta.ts', status: '', refines: [] });
  }

  @Verifies<ComplianceCoreFeature>('parseRequirementSourceReturnsNullForNonRequirementClass')
  'returns null for abstract exported class NOT extending Requirement'() {
    const src = `export abstract class NotAReq extends Feature {}`;
    expect(parseRequirementSource(src, 'x.ts')).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('parseRequirementSourceReturnsNullForNonAbstractOrNonExported')
  'returns null when the class is missing abstract or export modifier'() {
    const concrete = `export class C extends Requirement {}`;
    const unexported = `abstract class U extends Requirement {}`;
    expect(parseRequirementSource(concrete, 'c.ts')).toBeNull();
    expect(parseRequirementSource(unexported, 'u.ts')).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('parseRequirementSourceReturnsNullForNonRequirementClass')
  'ignores non-string id initializers (keeps className fallback)'() {
    const src = `
      export abstract class GammaReq extends Requirement {
        readonly id = 42 as const;
      }
    `;
    const meta = parseRequirementSource(src, 'gamma.ts');
    expect(meta).toEqual({ id: 'GammaReq', className: 'GammaReq', file: 'gamma.ts', status: '', refines: [] });
  }

  @Verifies<ComplianceCoreFeature>('parseRequirementSourceExtractsStatusLiteral')
  'reads the workflow status from its string literal'() {
    const src = `
      export abstract class DeltaReq extends Requirement {
        readonly id = 'REQ-DELTA';
        readonly status = 'Approved' as const;
      }
    `;
    expect(parseRequirementSource(src, 'delta.ts')!.status).toBe('Approved');
  }

  @Verifies<ComplianceCoreFeature>('parseRequirementSourceExtractsStatusLiteral')
  'leaves status empty when it is not a statically readable literal'() {
    const src = `
      export abstract class EpsilonReq extends Requirement {
        abstract compute(): void;
        declare readonly title: string;
        readonly id = 'REQ-EPSILON';
        readonly status = STATUSES.approved;
      }
    `;
    const meta = parseRequirementSource(src, 'epsilon.ts')!;
    expect(meta.status).toBe('');
    expect(meta.id).toBe('REQ-EPSILON');
  }

  @Verifies<ComplianceCoreFeature>('parseRequirementSourceReturnsNullForNonAbstractOrNonExported')
  'returns null for plain (non-abstract, non-exported) class declarations'() {
    const src = `class Plain {}`;
    expect(parseRequirementSource(src, 'plain.ts')).toBeNull();
  }
}

@FeatureTest(ComplianceCoreFeature)
class ReadRequirementsTests {
  @Verifies<ComplianceCoreFeature>('readRequirementsWalksDirAndReturnsMetas')
  async 'recursively collects RequirementMeta for every abstract exported Requirement class'() {
    await withTmpDir(async dir => {
      await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
      await fs.writeFile(path.join(dir, 'top.ts'), REQ_SRC('TopReq', 'REQ-TOP'));
      await fs.writeFile(path.join(dir, 'sub', 'nested.ts'), REQ_SRC('NestedReq', 'REQ-NESTED'));
      await fs.writeFile(path.join(dir, 'notes.md'), '# not a requirement');
      const reqs = await readRequirements(dir);
      const byId = Object.fromEntries(reqs.map(r => [r.id, r.file]));
      expect(byId['REQ-TOP']).toBe('top.ts');
      expect(byId['REQ-NESTED']).toBe('sub/nested.ts');
      expect(reqs.length).toBe(2);
    });
  }

  @Verifies<ComplianceCoreFeature>('readRequirementsReturnsEmptyWhenDirMissing')
  async 'returns an empty array when the directory does not exist'() {
    const bogus = path.join(os.tmpdir(), 'req-pkg-test-does-not-exist-zzz');
    const reqs = await readRequirements(bogus);
    expect(reqs).toEqual([]);
  }

  @Verifies<ComplianceCoreFeature>('readRequirementsWalksDirAndReturnsMetas')
  async '.ts files without a Requirement class are skipped silently'() {
    await withTmpDir(async dir => {
      await fs.writeFile(path.join(dir, 'not-a-req.ts'), 'export const x = 1;');
      await fs.writeFile(path.join(dir, 'valid.ts'), REQ_SRC('OnlyReq', 'REQ-ONLY'));
      const reqs = await readRequirements(dir);
      expect(reqs.map(r => r.id)).toEqual(['REQ-ONLY']);
    });
  }
}

const featureMeta = (id: string, satisfies: readonly string[]): FeatureMeta => ({
  id, title: id, priority: 'medium', acMethods: [], acDetails: [],
  enabled: true, className: `${id}Feature`, file: `${id}.ts`, satisfies,
});

const requirementMeta = (
  id: string, className: string, status: string, refines: readonly string[] = [],
): RequirementMeta => ({ id, className, file: `${className}.ts`, status, refines });

@FeatureTest(ComplianceCoreFeature)
class DeriveTraceabilityCorpusTests {
  @Verifies<ComplianceCoreFeature>('deriveCorpusResolvesSatisfiesClassNamesToReqIds')
  'maps each @Satisfies class name onto the REQ-ID of the matching Requirement'() {
    const corpus = deriveTraceabilityCorpus(
      [featureMeta('BUILD', ['NoJavaScriptRequirement'])],
      [requirementMeta('REQ-NO-JS', 'NoJavaScriptRequirement', 'Approved')],
    );
    expect(corpus.features).toEqual([{ id: 'BUILD', satisfies: ['REQ-NO-JS'] }]);
  }

  @Verifies<ComplianceCoreFeature>('deriveCorpusKeepsClassNamesThatResolveToNoRequirement')
  'keeps an unresolved class name verbatim so the Feature is not reported as an orphan'() {
    const corpus = deriveTraceabilityCorpus(
      [featureMeta('EXT', ['RequirementFromAnotherPackage'])],
      [],
    );
    expect(corpus.features).toEqual([{ id: 'EXT', satisfies: ['RequirementFromAnotherPackage'] }]);
  }

  @Verifies<ComplianceCoreFeature>('deriveCorpusKeepsClassNamesThatResolveToNoRequirement')
  'leaves an undecorated Feature with no links at all'() {
    const corpus = deriveTraceabilityCorpus([featureMeta('ORPHAN', [])], []);
    expect(corpus.features).toEqual([{ id: 'ORPHAN', satisfies: [] }]);
  }

  @Verifies<ComplianceCoreFeature>('deriveCorpusProjectsRequirementStatus')
  'carries each Requirement id and workflow status through to the gate view'() {
    const corpus = deriveTraceabilityCorpus([], [
      requirementMeta('REQ-A', 'AReq', 'Approved'),
      requirementMeta('REQ-B', 'BReq', 'Draft'),
    ]);
    expect(corpus.requirements).toEqual([
      { id: 'REQ-A', status: 'Approved', refines: [] },
      { id: 'REQ-B', status: 'Draft', refines: [] },
    ]);
  }

  @Verifies<ComplianceCoreFeature>('deriveCorpusResolvesRefinesClassNamesToReqIds')
  'resolves each @Refines parent to its REQ-ID, keeping unresolved names verbatim'() {
    const corpus = deriveTraceabilityCorpus([], [
      requirementMeta('REQ-ROOT', 'RootReq', 'Approved'),
      requirementMeta('REQ-LEAF', 'LeafReq', 'Approved', ['RootReq', 'ReqFromAnotherPackage']),
    ]);
    expect(corpus.requirements[1]).toEqual({
      id: 'REQ-LEAF', status: 'Approved', refines: ['REQ-ROOT', 'ReqFromAnotherPackage'],
    });
  }
}

void ReadFeaturesTests;
void LoadCoverageSummaryTests;
void FindLatestCoverageSummaryTests;
void ParseRequirementSourceTests;
void ReadRequirementsTests;
void DeriveTraceabilityCorpusTests;
