import { expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { CodeTraceFeature } from '@frenchexdev2/requirements-requirements';
import {
  sourceHash,
  tracePath,
  scanParticipation,
  loadCodeTrace,
  codeEvidenceState,
  explainCode,
  featureCode,
  codeImpact,
  codeGaps,
  type CodeFeature,
  type CodeTraceProject,
  type TraceEvidence,
} from '../../src/code-trace.js';

const BIZ = '@acme/business';

function feat(partial: Partial<CodeFeature> & Pick<CodeFeature, 'id' | 'key'>): CodeFeature {
  return {
    title: partial.title ?? partial.id,
    requirement: {
      id: 'REQ-1',
      rationale: 'because',
      status: 'Accepted',
      provenance: 'spec',
      ...(partial.requirement ?? {}),
    },
    acs: partial.acs ?? [{ name: 'doThing', title: 'Do thing' }],
    deprecated: partial.deprecated,
    replacedBy: partial.replacedBy,
    declaration: partial.declaration,
    id: partial.id,
    key: partial.key,
  };
}

const CART = feat({ id: 'CART', key: 'CartFeature' });
const PAY = feat({ id: 'PAY', key: 'PayFeature', deprecated: true });
const OLD = feat({ id: 'OLD', key: 'OldFeature', deprecated: true, replacedBy: 'CART' });

async function withTmpDir(fn: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'req-codetrace-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

@FeatureTest(CodeTraceFeature)
class CodeTracePrimitiveTests {
  @Verifies<CodeTraceFeature>('hashesSourceBytesWithSha256')
  'hashes source bytes with sha256'() {
    expect(sourceHash('hello')).toMatch(/^[a-f0-9]{64}$/);
    expect(sourceHash('hello')).toBe(sourceHash('hello'));
    expect(sourceHash('hello')).not.toBe(sourceHash('world'));
  }

  @Verifies<CodeTraceFeature>('normalizesPathsToPosixAbsolute')
  'normalizes paths to posix absolute'() {
    const p = tracePath('src/a.ts');
    expect(p.includes('\\')).toBe(false);
    expect(path.isAbsolute(p.replace(/\//g, path.sep))).toBe(true);
  }
}

@FeatureTest(CodeTraceFeature)
class ScanParticipationDecoratorTests {
  @Verifies<CodeTraceFeature>('linksNamedParticipatesInDecorator')
  'links named ParticipatesIn decorator on class'() {
    const text = [
      "import { ParticipatesIn, CartFeature } from '@acme/business';",
      '@ParticipatesIn(CartFeature)',
      'export class CartService {}',
    ].join('\n');
    const r = scanParticipation('/tmp/cart.ts', text, [CART], BIZ);
    expect(r.links).toHaveLength(1);
    expect(r.links[0]!.featureId).toBe('CART');
    expect(r.links[0]!.origin).toBe('decorator');
    expect(r.links[0]!.symbol).toBe('CartService');
    expect(r.diagnostics).toHaveLength(0);
  }

  @Verifies<CodeTraceFeature>('linksNamespaceParticipatesInDecorator')
  'links namespace ParticipatesIn decorator'() {
    const text2 = [
      "import * as Part from '@acme/business';",
      "import { CartFeature } from '@acme/business';",
      '@Part.ParticipatesIn(CartFeature)',
      'export class CartService {}',
    ].join('\n');
    const r = scanParticipation('/tmp/ns.ts', text2, [CART], BIZ);
    expect(r.links.some(l => l.featureId === 'CART' && l.origin === 'decorator')).toBe(true);
  }

  @Verifies<CodeTraceFeature>('linksCataloguePropertyAccess')
  'links catalogue property access'() {
    const text = [
      "import { ParticipatesIn, BuilderFeatures } from '@acme/business';",
      '@ParticipatesIn(BuilderFeatures.CartFeature)',
      'export class CartService {}',
    ].join('\n');
    const r = scanParticipation('/tmp/cat.ts', text, [CART], BIZ);
    expect(r.links[0]!.featureId).toBe('CART');
  }

  @Verifies<CodeTraceFeature>('linksNamespaceCataloguePropertyAccess')
  'links namespace catalogue property access'() {
    const text = [
      "import * as Biz from '@acme/business';",
      "import { ParticipatesIn } from '@acme/business';",
      '@ParticipatesIn(Biz.BuilderFeatures.CartFeature)',
      'export class CartService {}',
    ].join('\n');
    const r = scanParticipation('/tmp/nscat.ts', text, [CART], BIZ);
    expect(r.links[0]!.featureId).toBe('CART');
  }

  @Verifies<CodeTraceFeature>('linksMethodDecoratorWithSymbol')
  'links method decorator with symbol'() {
    const text = [
      "import { ParticipatesIn, CartFeature } from '@acme/business';",
      'export class CartService {',
      '  @ParticipatesIn(CartFeature)',
      '  addItem() {}',
      '}',
    ].join('\n');
    const r = scanParticipation('/tmp/meth.ts', text, [CART], BIZ);
    expect(r.links[0]!.symbol).toBe('addItem');
    expect(r.links[0]!.origin).toBe('decorator');
  }

  @Verifies<CodeTraceFeature>('acceptsSharedKernelParticipatesInImport')
  'accepts shared-kernel ParticipatesIn import'() {
    const text = [
      "import { ParticipatesIn } from '@frenchexdev2/requirements-shared-kernel/participation';",
      "import { CartFeature } from '@acme/business';",
      '@ParticipatesIn(CartFeature)',
      'export class CartService {}',
    ].join('\n');
    const r = scanParticipation('/tmp/sk.ts', text, [CART], BIZ);
    expect(r.links[0]!.featureId).toBe('CART');
  }

  @Verifies<CodeTraceFeature>('reportsUnknownFeatureReference')
  'reports unknown feature reference'() {
    const text = [
      "import { ParticipatesIn, GhostFeature } from '@acme/business';",
      '@ParticipatesIn(GhostFeature)',
      'export class Ghost {}',
    ].join('\n');
    const r = scanParticipation('/tmp/unk.ts', text, [CART], BIZ);
    expect(r.diagnostics.some(d => d.code === 'RAC_UNKNOWN_FEATURE')).toBe(true);

    const lit = [
      "import { ParticipatesIn } from '@acme/business';",
      "@ParticipatesIn('CART')",
      'export class X {}',
    ].join('\n');
    const r2 = scanParticipation('/tmp/lit.ts', lit, [CART], BIZ);
    expect(r2.diagnostics.some(d => d.code === 'RAC_UNKNOWN_FEATURE')).toBe(true);

    const badKey = [
      "import { ParticipatesIn, BuilderFeatures } from '@acme/business';",
      '@ParticipatesIn(BuilderFeatures.MissingKey)',
      'export class X {}',
    ].join('\n');
    const r3 = scanParticipation('/tmp/badkey.ts', badKey, [CART], BIZ);
    expect(r3.diagnostics.some(d => d.code === 'RAC_UNKNOWN_FEATURE')).toBe(true);
  }

  @Verifies<CodeTraceFeature>('reportsDeprecatedFeatureWithAndWithoutReplacement')
  'reports deprecated feature with and without replacement'() {
    const without = [
      "import { ParticipatesIn, PayFeature } from '@acme/business';",
      '@ParticipatesIn(PayFeature)',
      'export class Pay {}',
    ].join('\n');
    const r1 = scanParticipation('/tmp/dep1.ts', without, [PAY], BIZ);
    expect(r1.diagnostics.some(d => d.code === 'RAC_DEPRECATED_FEATURE' && !d.message.includes('use '))).toBe(true);
    expect(r1.links).toHaveLength(1);

    const withRep = [
      "import { ParticipatesIn, OldFeature } from '@acme/business';",
      '@ParticipatesIn(OldFeature)',
      'export class Old {}',
    ].join('\n');
    const r2 = scanParticipation('/tmp/dep2.ts', withRep, [OLD], BIZ);
    expect(r2.diagnostics.some(d => d.code === 'RAC_DEPRECATED_FEATURE' && d.message.includes('use CART'))).toBe(true);
  }

  @Verifies<CodeTraceFeature>('reportsEmptyParticipation')
  'reports empty participation'() {
    const text = [
      "import { ParticipatesIn } from '@acme/business';",
      '@ParticipatesIn()',
      'export class Empty {}',
    ].join('\n');
    const r = scanParticipation('/tmp/empty.ts', text, [CART], BIZ);
    expect(r.diagnostics.some(d => d.code === 'RAC_EMPTY_PARTICIPATION')).toBe(true);
  }

  @Verifies<CodeTraceFeature>('reportsInvalidDecoratorTarget')
  'reports invalid decorator target'() {
    const text = [
      "import { ParticipatesIn, CartFeature } from '@acme/business';",
      'export class Box {',
      '  @ParticipatesIn(CartFeature)',
      '  prop = 1;',
      '}',
    ].join('\n');
    const r = scanParticipation('/tmp/prop.ts', text, [CART], BIZ);
    expect(r.diagnostics.some(d => d.code === 'RAC_INVALID_DECORATOR')).toBe(true);
  }

  @Verifies<CodeTraceFeature>('ignoresUnrelatedDecoratorsAndImports')
  'ignores unrelated decorators and imports'() {
    const text = [
      "import { SomethingElse } from '@acme/business';",
      "import { foo } from 'other';",
      '@SomethingElse()',
      'export class Z {}',
      "import { ParticipatesIn as Renamed } from 'untrusted';",
      '@Renamed()',
      'export class Y {}',
      // Bare identifier decorator exercises the non-CallExpression continue path.
      '@Sealed',
      'export class Bare {}',
    ].join('\n');
    const r = scanParticipation('/tmp/ign.ts', text, [CART], BIZ);
    expect(r.links).toHaveLength(0);

    // Property access whose owner is neither a catalogue nor a namespace catalogue.
    const unresolved = [
      "import { ParticipatesIn, NotCatalogue } from '@acme/business';",
      '@ParticipatesIn(NotCatalogue.CartFeature)',
      'export class Ghost {}',
      "import * as Biz from '@acme/business';",
      '@ParticipatesIn(Biz.WrongExport.CartFeature)',
      'export class Ghost2 {}',
    ].join('\n');
    const r2 = scanParticipation('/tmp/unres.ts', unresolved, [CART], BIZ);
    expect(r2.diagnostics.some(d => d.code === 'RAC_UNKNOWN_FEATURE')).toBe(true);
    expect(r2.links).toHaveLength(0);
  }
}

@FeatureTest(CodeTraceFeature)
class ScanParticipationMarkerTests {
  @Verifies<CodeTraceFeature>('linksInstructionMarkerPrecedingStatement')
  'links instruction marker preceding statement'() {
    const text = ['// @rac-feature CART', 'const x = 1;'].join('\n');
    const r = scanParticipation('/tmp/m1.ts', text, [CART], BIZ);
    expect(r.links[0]!.origin).toBe('instruction');
    expect(r.links[0]!.featureId).toBe('CART');

    // Multiple following statements exercise the sort comparator (pick nearest).
    const multi = [
      '// @rac-feature CART',
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ].join('\n');
    const r2 = scanParticipation('/tmp/m2.ts', multi, [CART], BIZ);
    expect(r2.links).toHaveLength(1);
    expect(r2.links[0]!.origin).toBe('instruction');
    expect(r2.links[0]!.featureId).toBe('CART');
  }

  @Verifies<CodeTraceFeature>('linksBalancedFeatureBlock')
  'links balanced feature block'() {
    const text = [
      '// @rac-feature-begin CART',
      'const a = 1;',
      'const b = 2;',
      '// @rac-feature-end CART',
    ].join('\n');
    const r = scanParticipation('/tmp/blk.ts', text, [CART], BIZ);
    expect(r.links[0]!.origin).toBe('block');
    expect(r.links[0]!.featureId).toBe('CART');
    expect(r.diagnostics).toHaveLength(0);
  }

  @Verifies<CodeTraceFeature>('reportsMalformedFeatureMarker')
  'reports malformed feature marker'() {
    const text = ['// @rac-feature not-valid', 'const x = 1;'].join('\n');
    const r = scanParticipation('/tmp/mal.ts', text, [CART], BIZ);
    expect(r.diagnostics.some(d => d.code === 'RAC_INVALID_MARKER' && d.message.includes('Malformed'))).toBe(true);
  }

  @Verifies<CodeTraceFeature>('reportsMarkerNotImmediatelyPrecedingStatement')
  'reports marker not immediately preceding statement'() {
    const text = ['// @rac-feature CART', '/* spacer */', 'const x = 1;'].join('\n');
    const r = scanParticipation('/tmp/gap.ts', text, [CART], BIZ);
    expect(r.diagnostics.some(d => d.code === 'RAC_INVALID_MARKER' && d.message.includes('immediately'))).toBe(true);

    const lonely = '// @rac-feature CART\n';
    const r2 = scanParticipation('/tmp/lonely.ts', lonely, [CART], BIZ);
    expect(r2.diagnostics.some(d => d.code === 'RAC_INVALID_MARKER' && d.message.includes('immediately'))).toBe(true);
  }

  @Verifies<CodeTraceFeature>('reportsUnbalancedEndMarker')
  'reports unbalanced end marker'() {
    const text = ['// @rac-feature-end CART', 'const x = 1;'].join('\n');
    const r = scanParticipation('/tmp/end.ts', text, [CART], BIZ);
    expect(r.diagnostics.some(d => d.code === 'RAC_UNBALANCED_BLOCK' && d.message.includes('Unexpected end'))).toBe(true);

    const mismatch = [
      '// @rac-feature-begin CART',
      'const a = 1;',
      '// @rac-feature-end PAY',
    ].join('\n');
    const r2 = scanParticipation('/tmp/mis.ts', mismatch, [CART, PAY], BIZ);
    expect(r2.diagnostics.some(d => d.code === 'RAC_UNBALANCED_BLOCK')).toBe(true);
  }

  @Verifies<CodeTraceFeature>('reportsUnclosedFeatureBlock')
  'reports unclosed feature block'() {
    const text = ['// @rac-feature-begin CART', 'const a = 1;'].join('\n');
    const r = scanParticipation('/tmp/open.ts', text, [CART], BIZ);
    expect(r.diagnostics.some(d => d.code === 'RAC_UNBALANCED_BLOCK' && d.message.includes('Unclosed'))).toBe(true);
  }
}

@FeatureTest(CodeTraceFeature)
class LoadCodeTraceTests {
  @Verifies<CodeTraceFeature>('loadsProjectFromConfigAndSources')
  async 'loads project from config and sources'() {
    await withTmpDir(async dir => {
      const features = [
        feat({
          id: 'CART',
          key: 'CartFeature',
          declaration: { file: 'features/cart.ts', line: 1 },
          requirement: {
            id: 'REQ-1',
            rationale: 'r',
            status: 'Accepted',
            provenance: 'p',
            declaration: { file: 'reqs/req.ts', line: 2 },
          },
          acs: [{ name: 'doThing', title: 'Do', file: 'test/unit/a.test.ts', line: 3 }],
        }),
      ];
      await writeJson(path.join(dir, 'spec', 'features.json'), features);
      await fs.mkdir(path.join(dir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(dir, 'src', 'cart.ts'),
        [
          "import { ParticipatesIn, CartFeature } from '@acme/business';",
          '@ParticipatesIn(CartFeature)',
          'export class CartService {}',
        ].join('\n'),
        'utf8',
      );
      const cfg = path.join(dir, 'code-trace.json');
      await writeJson(cfg, {
        sources: ['src'],
        specification: 'spec/features.json',
        businessModule: BIZ,
        catalogueExport: 'BuilderFeatures',
      });
      const project = await loadCodeTrace(cfg);
      expect(project.features).toHaveLength(1);
      expect(project.links.some(l => l.featureId === 'CART')).toBe(true);
      expect(Object.keys(project.sources).length).toBe(1);
      expect(project.features[0]!.declaration!.file.replace(/\\/g, '/').endsWith('features/cart.ts')).toBe(true);
    });
  }

  @Verifies<CodeTraceFeature>('rejectsInvalidConfiguration')
  async 'rejects invalid configuration'() {
    await withTmpDir(async dir => {
      const cfg = path.join(dir, 'bad.json');
      await writeJson(cfg, { sources: 'nope', specification: 1, businessModule: null });
      await expect(loadCodeTrace(cfg)).rejects.toThrow(/Invalid code trace configuration/);
    });
  }

  @Verifies<CodeTraceFeature>('rejectsDuplicateFeatureCatalogue')
  async 'rejects duplicate feature catalogue'() {
    await withTmpDir(async dir => {
      await writeJson(path.join(dir, 'features.json'), [CART, { ...CART }]);
      const cfg = path.join(dir, 'cfg.json');
      await writeJson(cfg, { sources: ['src'], specification: 'features.json', businessModule: BIZ });
      await fs.mkdir(path.join(dir, 'src'), { recursive: true });
      await expect(loadCodeTrace(cfg)).rejects.toThrow(/Invalid or duplicate feature catalogue/);
    });
  }

  @Verifies<CodeTraceFeature>('skipsIgnoredDirectoriesAndDeclarationFiles')
  async 'skips ignored directories and declaration files'() {
    await withTmpDir(async dir => {
      await writeJson(path.join(dir, 'features.json'), [CART]);
      const src = path.join(dir, 'src');
      await fs.mkdir(path.join(src, 'node_modules', 'pkg'), { recursive: true });
      await fs.writeFile(path.join(src, 'node_modules', 'pkg', 'x.ts'), 'export const n = 1;', 'utf8');
      await fs.mkdir(path.join(src, 'dist'), { recursive: true });
      await fs.writeFile(path.join(src, 'dist', 'out.ts'), 'export const d = 1;', 'utf8');
      await fs.mkdir(path.join(src, '.git'), { recursive: true });
      await fs.writeFile(path.join(src, '.git', 'x.ts'), 'export const g = 1;', 'utf8');
      await fs.mkdir(path.join(src, 'test-results'), { recursive: true });
      await fs.writeFile(path.join(src, 'test-results', 'x.ts'), 'export const t = 1;', 'utf8');
      await fs.mkdir(path.join(src, '.stryker-tmp'), { recursive: true });
      await fs.writeFile(path.join(src, '.stryker-tmp', 'x.ts'), 'export const s = 1;', 'utf8');
      await fs.writeFile(path.join(src, 'keep.ts'), 'export const k = 1;', 'utf8');
      await fs.writeFile(path.join(src, 'keep.d.ts'), 'export declare const k: number;', 'utf8');
      await fs.writeFile(path.join(src, 'keep.tsx'), 'export const t = 1;', 'utf8');
      await fs.writeFile(path.join(src, 'keep.mts'), 'export const m = 1;', 'utf8');
      await fs.writeFile(path.join(src, 'keep.cts'), 'export const c = 1;', 'utf8');
      // Nested non-ignored directory exercises recursive walk().
      await fs.mkdir(path.join(src, 'nested', 'deep'), { recursive: true });
      await fs.writeFile(path.join(src, 'nested', 'deep', 'nested.ts'), 'export const nested = 1;', 'utf8');
      try {
        await fs.symlink(path.join(src, 'keep.ts'), path.join(src, 'link.ts'));
      } catch {
        /* Windows without privilege */
      }
      const cfg = path.join(dir, 'cfg.json');
      await writeJson(cfg, { sources: ['src'], specification: 'features.json', businessModule: BIZ });
      const project = await loadCodeTrace(cfg);
      const basenames = Object.keys(project.sources).map(f => path.posix.basename(f));
      expect(basenames).toContain('keep.ts');
      expect(basenames).toContain('keep.tsx');
      expect(basenames).toContain('keep.mts');
      expect(basenames).toContain('keep.cts');
      expect(basenames).toContain('nested.ts');
      expect(basenames).not.toContain('x.ts');
      expect(basenames).not.toContain('out.ts');
      expect(basenames).not.toContain('keep.d.ts');
      expect(basenames).not.toContain('link.ts');
    });
  }

  @Verifies<CodeTraceFeature>('appliesSourceOverridesAndAbortSignal')
  async 'applies source overrides and abort signal'() {
    await withTmpDir(async dir => {
      await writeJson(path.join(dir, 'features.json'), [CART]);
      await fs.mkdir(path.join(dir, 'src'), { recursive: true });
      const file = path.join(dir, 'src', 'a.ts');
      await fs.writeFile(file, 'export const a = 1;', 'utf8');
      const cfg = path.join(dir, 'cfg.json');
      await writeJson(cfg, { sources: ['src'], specification: 'features.json', businessModule: BIZ });
      const key = tracePath(file);
      const overrideText = [
        "import { ParticipatesIn, CartFeature } from '@acme/business';",
        '@ParticipatesIn(CartFeature)',
        'export class A {}',
      ].join('\n');
      const project = await loadCodeTrace(cfg, new Map([[key, overrideText]]));
      expect(project.sources[key]).toBe(sourceHash(overrideText));
      expect(project.links.some(l => l.featureId === 'CART')).toBe(true);

      const ac = new AbortController();
      ac.abort();
      await expect(loadCodeTrace(cfg, new Map(), ac.signal)).rejects.toThrow();
    });
  }

  @Verifies<CodeTraceFeature>('recordsGeneratedOriginsCurrentStaleUnknownAndInvalid')
  async 'records generated origins current stale unknown and invalid'() {
    await withTmpDir(async dir => {
      await writeJson(path.join(dir, 'features.json'), [CART]);
      const src = path.join(dir, 'src');
      await fs.mkdir(src, { recursive: true });
      const originSrc = path.join(src, 'origin.ts');
      const originText = 'export const origin = 1;\n';
      await fs.writeFile(originSrc, originText, 'utf8');
      const hash = sourceHash(originText);

      await fs.writeFile(
        path.join(src, 'gen-current.ts'),
        '// @rac-generated ' + JSON.stringify({ source: 'origin.ts', start: 1, end: 1, generator: 'g', sourceHash: hash }) + '\nexport const g = 1;\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(src, 'gen-stale.ts'),
        '// @rac-generated ' + JSON.stringify({ source: 'origin.ts', start: 1, end: 1, generator: 'g', sourceHash: 'deadbeef' }) + '\nexport const g = 2;\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(src, 'gen-unknown.ts'),
        '// @rac-generated ' + JSON.stringify({ source: 'origin.ts', start: 1, end: 1, generator: 'g' }) + '\nexport const g = 3;\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(src, 'gen-invalid.ts'),
        '// @rac-generated {not-json\nexport const g = 4;\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(src, 'gen-bad-shape.ts'),
        '// @rac-generated ' + JSON.stringify({ source: 1, start: 'x', end: 1, generator: 'g' }) + '\nexport const g = 5;\n',
        'utf8',
      );

      const cfg = path.join(dir, 'cfg.json');
      await writeJson(cfg, { sources: ['src'], specification: 'features.json', businessModule: BIZ });
      const project = await loadCodeTrace(cfg);
      const byFile = Object.fromEntries((project.generatedOrigins ?? []).map(o => [path.posix.basename(o.file), o]));
      expect(byFile['gen-current.ts']!.state).toBe('current');
      expect(byFile['gen-stale.ts']!.state).toBe('stale');
      expect(byFile['gen-unknown.ts']!.state).toBe('unknown');
      expect(project.diagnostics.some(d => d.code === 'RAC_STALE_GENERATED_ORIGIN')).toBe(true);
      expect(project.diagnostics.filter(d => d.code === 'RAC_INVALID_GENERATED_ORIGIN').length).toBeGreaterThanOrEqual(2);
    });
  }

  @Verifies<CodeTraceFeature>('loadsEvidenceAndHashesInputs')
  async 'loads evidence and hashes inputs'() {
    await withTmpDir(async dir => {
      await writeJson(path.join(dir, 'features.json'), [CART]);
      await fs.mkdir(path.join(dir, 'src'), { recursive: true });
      const srcFile = path.join(dir, 'src', 'a.ts');
      await fs.writeFile(srcFile, 'export const a = 1;', 'utf8');
      const inputFile = path.join(dir, 'input.txt');
      await fs.writeFile(inputFile, 'payload', 'utf8');
      const evidence: TraceEvidence = {
        runId: 'r1',
        sources: { [tracePath(srcFile)]: sourceHash('export const a = 1;') },
        tests: [{ featureId: 'CART', ac: 'doThing', test: 't', file: 't.ts', status: 'passed' }],
        versions: {},
        configurations: {},
        complete: true,
        inputs: { [inputFile]: sourceHash('payload'), [path.join(dir, 'missing.txt')]: 'x' },
        runtimeCoverage: { [tracePath(srcFile)]: [1] },
      };
      await writeJson(path.join(dir, 'evidence.json'), evidence);
      const cfg = path.join(dir, 'cfg.json');
      await writeJson(cfg, {
        sources: ['src'],
        specification: 'features.json',
        businessModule: BIZ,
        evidence: 'evidence.json',
      });
      const project = await loadCodeTrace(cfg);
      expect(project.evidence?.runId).toBe('r1');
      expect(project.inputHashes?.[inputFile]).toBe(sourceHash('payload'));
      expect(project.inputHashes?.[path.join(dir, 'missing.txt')]).toBe('missing');

      const ov = new Map([[tracePath(inputFile), 'overridden']]);
      const project2 = await loadCodeTrace(cfg, ov);
      expect(project2.inputHashes?.[inputFile]).toBe(sourceHash('overridden'));
    });
  }

  @Verifies<CodeTraceFeature>('ignoresMissingEvidenceAndRethrowsOtherIoErrors')
  async 'ignores missing evidence and rethrows other io errors'() {
    await withTmpDir(async dir => {
      await writeJson(path.join(dir, 'features.json'), [CART]);
      await fs.mkdir(path.join(dir, 'src'), { recursive: true });
      await fs.writeFile(path.join(dir, 'src', 'a.ts'), 'export const a = 1;', 'utf8');
      const cfg = path.join(dir, 'cfg.json');
      await writeJson(cfg, {
        sources: ['src'],
        specification: 'features.json',
        businessModule: BIZ,
        evidence: 'no-such-evidence.json',
      });
      const project = await loadCodeTrace(cfg);
      expect(project.evidence).toBeUndefined();

      await fs.mkdir(path.join(dir, 'evidence-dir'), { recursive: true });
      const cfg2 = path.join(dir, 'cfg2.json');
      await writeJson(cfg2, {
        sources: ['src'],
        specification: 'features.json',
        businessModule: BIZ,
        evidence: 'evidence-dir',
      });
      await expect(loadCodeTrace(cfg2)).rejects.toThrow();
    });
  }
}

function projectFixture(partial: Partial<CodeTraceProject> = {}): CodeTraceProject {
  const file = tracePath('/tmp/proj/src/a.ts');
  return {
    features: [CART, PAY],
    links: [
      {
        file,
        start: 1,
        end: 3,
        startOffset: 0,
        endOffset: 10,
        featureId: 'CART',
        origin: 'decorator',
        symbol: 'CartService',
      },
    ],
    diagnostics: [
      {
        file,
        start: 2,
        end: 2,
        startOffset: 5,
        endOffset: 8,
        code: 'RAC_DEPRECATED_FEATURE',
        message: 'demo',
      },
    ],
    sources: { [file]: sourceHash('src') },
    generatedOrigins: [
      {
        file,
        start: 1,
        end: 10,
        startOffset: 0,
        endOffset: 100,
        source: '/tmp/origin.ts',
        sourceStart: 1,
        sourceEnd: 2,
        generator: 'g',
        state: 'current',
      },
    ],
    ...partial,
  };
}

@FeatureTest(CodeTraceFeature)
class EvidenceExplainImpactTests {
  @Verifies<CodeTraceFeature>('classifiesEvidenceMissingStaleIncompleteCurrent')
  'classifies evidence missing stale incomplete current'() {
    const file = tracePath('/tmp/proj/src/a.ts');
    expect(codeEvidenceState(projectFixture({ evidence: undefined }))).toBe('missing');

    const baseEv: TraceEvidence = {
      runId: 'r',
      sources: { [file]: sourceHash('src') },
      tests: [],
      versions: {},
      configurations: {},
      complete: true,
    };
    expect(codeEvidenceState(projectFixture({ evidence: baseEv }))).toBe('current');

    expect(
      codeEvidenceState(
        projectFixture({
          evidence: { ...baseEv, sources: { [file]: 'other' } },
        }),
      ),
    ).toBe('stale');

    expect(
      codeEvidenceState(
        projectFixture({
          evidence: { ...baseEv, complete: false },
        }),
      ),
    ).toBe('incomplete');

    expect(
      codeEvidenceState(
        projectFixture({
          evidence: {
            ...baseEv,
            inputs: { '/tmp/in.txt': 'abc' },
          },
          inputHashes: { '/tmp/in.txt': 'def' },
        }),
      ),
    ).toBe('stale');
  }

  @Verifies<CodeTraceFeature>('explainsCodeAtLineWithCoverageAndDiagnostics')
  'explains code at line with coverage and diagnostics'() {
    const file = tracePath('/tmp/proj/src/a.ts');
    const withEv = projectFixture({
      evidence: {
        runId: 'r',
        sources: { [file]: sourceHash('src') },
        tests: [{ featureId: 'CART', ac: 'doThing', test: 't', file: 't.ts', status: 'passed' }],
        versions: {},
        configurations: {},
        complete: true,
        runtimeCoverage: { [file]: [2] },
      },
    });
    const linked = explainCode(withEv, file, 2);
    expect(linked.message).toBe('Declared feature participation');
    expect(linked.links).toHaveLength(1);
    expect(linked.features[0]!.id).toBe('CART');
    expect(linked.features[0]!.tests).toHaveLength(1);
    expect(linked.evidenceState).toBe('current');
    expect(linked.runtimeCoverage).toBe('covered');
    expect(linked.generatedOrigins).toHaveLength(1);
    expect(linked.diagnostics).toHaveLength(1);

    const notObs = explainCode(withEv, file, 1);
    expect(notObs.runtimeCoverage).toBe('not-observed');

    const noCov = explainCode(
      projectFixture({
        evidence: {
          runId: 'r',
          sources: { [file]: sourceHash('src') },
          tests: [],
          versions: {},
          configurations: {},
          complete: true,
        },
      }),
      file,
      2,
    );
    expect(noCov.runtimeCoverage).toBe('missing');

    const stale = explainCode(
      projectFixture({
        evidence: {
          runId: 'r',
          sources: { [file]: 'old' },
          tests: [],
          versions: {},
          configurations: {},
          complete: true,
          runtimeCoverage: { [file]: [2] },
        },
      }),
      file,
      2,
    );
    expect(stale.runtimeCoverage).toBe('stale');

    const none = explainCode(projectFixture({ links: [] }), file, 9);
    expect(none.message).toBe('aucune association connue');

    // Missing evidence / generatedOrigins hit the ?? [] fallbacks while links exist.
    const noEv = explainCode(projectFixture({ evidence: undefined, generatedOrigins: undefined }), file, 2);
    expect(noEv.features[0]!.tests).toEqual([]);
    expect(noEv.generatedOrigins).toEqual([]);
    expect(noEv.evidenceState).toBe('missing');
  }

  @Verifies<CodeTraceFeature>('rejectsNonPositiveExplainLine')
  'rejects non-positive explain line'() {
    const p = projectFixture();
    expect(() => explainCode(p, '/tmp/proj/src/a.ts', 0)).toThrow(RangeError);
    expect(() => explainCode(p, '/tmp/proj/src/a.ts', 1.5)).toThrow(RangeError);
  }

  @Verifies<CodeTraceFeature>('navigatesFeatureCodeImpactAndGaps')
  'navigates feature code impact and gaps'() {
    const file = tracePath('/tmp/proj/src/a.ts');
    const current = projectFixture({
      evidence: {
        runId: 'r',
        sources: { [file]: sourceHash('src') },
        tests: [{ featureId: 'CART', ac: 'doThing', test: 't', file: 't.ts', status: 'passed' }],
        versions: {},
        configurations: {},
        complete: true,
      },
    });
    const fc = featureCode(current, 'CART');
    expect(fc.feature?.id).toBe('CART');
    expect(fc.code).toHaveLength(1);
    expect(fc.tests).toHaveLength(1);
    expect(featureCode(current, 'MISSING').feature).toBeUndefined();
    // No evidence → tests fallback via ?? [].
    expect(featureCode(projectFixture({ evidence: undefined }), 'CART').tests).toEqual([]);

    const impact = codeImpact(current, [file, '/tmp/other.ts']);
    expect(impact).toHaveLength(1);
    expect(impact[0]!.feature?.id).toBe('CART');

    const gapsCurrent = codeGaps(current);
    const cartGap = gapsCurrent.find(g => g.featureId === 'CART')!;
    expect(cartGap.missingImplementation).toBe(false);
    expect(cartGap.unprovedAcs).toEqual([]);
    const payGap = gapsCurrent.find(g => g.featureId === 'PAY')!;
    expect(payGap.missingImplementation).toBe(true);
    expect(payGap.unprovedAcs).toEqual(['doThing']);

    const gapsMissing = codeGaps(projectFixture({ evidence: undefined }));
    expect(gapsMissing.find(g => g.featureId === 'CART')!.unprovedAcs).toEqual(['doThing']);
  }
}

void CodeTracePrimitiveTests;
void ScanParticipationDecoratorTests;
void ScanParticipationMarkerTests;
void LoadCodeTraceTests;
void EvidenceExplainImpactTests;
