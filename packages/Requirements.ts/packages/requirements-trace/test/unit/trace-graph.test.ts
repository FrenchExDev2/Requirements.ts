import { expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureMermaidGraphFeature } from '@frenchexdev2/requirements-requirements';
import {
  parseGraphFormat,
  renderMermaid,
  renderDot,
  renderGraph,
  classifyAcCoverage,
  runTraceGraph,
  reqNodeId,
  featNodeId,
  acNodeId,
  testNodeId,
  GRAPH_FORMATS,
  type TraceGraphInput,
  type RequirementNodeInput,
} from '../../src/trace-graph';
import type { FeatureMeta, TestRef } from '@frenchexdev2/requirements-compliance';
import type { FileSystem, Logger, OutputSink } from '@frenchexdev2/requirements-core/ports';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function withTmpDir(fn: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'req-tracegraph-'));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

const FEATURE_SRC = (className: string, id = className, opts: { enabled?: boolean; acs?: string[] } = {}) => `
import { Feature, Priority } from './base';
export abstract class ${className} extends Feature {
  readonly id = '${id}';
  readonly title = '${id} title';
  readonly priority = Priority.Medium;
  ${opts.enabled === false ? "readonly enabled = false;" : ''}
  ${(opts.acs ?? ['doThing']).map(a => `abstract ${a}(): unknown;`).join('\n  ')}
}
`;

function feat(partial: Partial<FeatureMeta> = {}): FeatureMeta {
  return {
    id: 'CART',
    title: 'Cart',
    priority: 'high',
    acMethods: ['addItem', 'removeItem'],
    acDetails: [
      { name: 'addItem', expectedLevels: ['unit'] },
      { name: 'removeItem', expectedLevels: ['unit'] },
    ],
    enabled: true,
    className: 'CartFeature',
    file: 'cart.ts',
    satisfies: [],
    ...partial,
  };
}

function ref(partial: Partial<TestRef> = {}): TestRef {
  return {
    feature: 'CartFeature',
    featureId: 'CART',
    ac: 'addItem',
    testFile: 'test/unit/cart.test.ts',
    testName: 'addsItem',
    level: 'unit',
    ...partial,
  };
}

function mkSink(): OutputSink & { buf: string } {
  const o = { buf: '' } as OutputSink & { buf: string };
  o.write = (s: string) => { o.buf += s; };
  o.isTty = () => false;
  return o;
}

function mkLogger(): Logger & { warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    info: () => {},
    warn: (msg: string) => { warnings.push(msg); },
    error: () => {},
  };
}

function realishFs(): FileSystem {
  return {
    readFile: (p) => fs.readFile(p, 'utf8'),
    writeFile: (p, c) => fs.writeFile(p, c, 'utf8'),
    exists: async (p) => { try { await fs.stat(p); return true; } catch { return false; } },
    readdir: (p) => fs.readdir(p),
    stat: (p) => fs.stat(p),
    mkdir: (p) => fs.mkdir(p, { recursive: true }).then(() => {}),
  };
}

// ── Tests — one @Verifies per AC ────────────────────────────────────────────

@FeatureTest(FeatureMermaidGraphFeature)
class TraceGraphTests {

  @Verifies<FeatureMermaidGraphFeature>('traceGraphEmitsMermaidFlowchart')
  'emits a valid mermaid flowchart LR with expected node ids'() {
    const input: TraceGraphInput = {
      requirements: [{ id: 'REQ-CART', title: 'cart req', satisfiedBy: ['CART'] }],
      features: [feat()],
      testRefs: [ref()],
      featuresDir: 'f',
    };
    const out = renderMermaid(input);
    expect(out.startsWith('flowchart LR\n')).toBe(true);
    expect(out).toContain(reqNodeId('REQ-CART'));
    expect(out).toContain(featNodeId('CART'));
    expect(out).toContain(acNodeId('CART', 'addItem'));
    expect(out).toContain(acNodeId('CART', 'removeItem'));
    expect(out).toContain(testNodeId('CartFeature', 'addsItem'));
    expect(out).toContain(`${reqNodeId('REQ-CART')} --> ${featNodeId('CART')}`);
    expect(out).toContain(`${featNodeId('CART')} --> ${acNodeId('CART', 'addItem')}`);
    expect(out).toContain(`${acNodeId('CART', 'addItem')} --> ${testNodeId('CartFeature', 'addsItem')}`);
    // also exercises top-level renderGraph default
    expect(renderGraph(input, 'mermaid')).toBe(out);
  }

  @Verifies<FeatureMermaidGraphFeature>('traceGraphHighlightsDisabledFeatures')
  'applies the disabled class to disabled feature nodes'() {
    const input: TraceGraphInput = {
      requirements: [],
      features: [feat({ enabled: false })],
      testRefs: [],
      featuresDir: 'f',
    };
    const out = renderMermaid(input);
    expect(out).toContain('classDef disabled fill:#e5e7eb,stroke:#9ca3af,stroke-dasharray:5 5');
    expect(out).toContain(`class ${featNodeId('CART')} disabled`);
    // and DOT path, for coverage
    const dot = renderDot(input);
    expect(dot).toContain('style=dashed');
  }

  @Verifies<FeatureMermaidGraphFeature>('traceGraphDistinguishesCoveredFromUncoveredAcs')
  'tags covered ACs as covered and uncovered ACs as uncovered'() {
    // Use a ref that resolves via className fallback (no featureId) so we hit
    // the classToId branch in classifyAcCoverage.
    const coverage = classifyAcCoverage(
      [feat()],
      [ref({ featureId: '', ac: 'addItem' })],
    );
    expect(coverage.find(c => c.ac === 'addItem')!.covered).toBe(true);
    expect(coverage.find(c => c.ac === 'removeItem')!.covered).toBe(false);

    const out = renderMermaid({
      requirements: [],
      features: [feat()],
      testRefs: [ref()],
      featuresDir: 'f',
    });
    expect(out).toContain(`class ${acNodeId('CART', 'addItem')} covered`);
    expect(out).toContain(`class ${acNodeId('CART', 'removeItem')} uncovered`);
    expect(out).toContain('classDef covered fill:#d1fae5,stroke:#10b981');
    expect(out).toContain('classDef uncovered fill:#fee2e2,stroke:#ef4444');

    // Exercise the className-fallback branch when no features match at all
    // (ensures `classToId.get(ref.feature) ?? ref.feature` path is covered).
    const unknownRef = classifyAcCoverage([], [ref({ featureId: '' })]);
    expect(unknownRef).toEqual([]);

    // Mermaid + DOT AC→TEST fallback: ref.featureId empty, className maps via
    // classToId; plus duplicate refs are deduped on the test-node side.
    const dupRefs: TestRef[] = [
      ref({ featureId: '', ac: 'addItem' }),
      ref({ featureId: '', ac: 'addItem' }), // duplicate → hits the `continue` branch
    ];
    const input: TraceGraphInput = {
      requirements: [], features: [feat()], testRefs: dupRefs, featuresDir: 'f',
    };
    const mer = renderMermaid(input);
    // Only one test node, but two edges (edges aren't deduped, which is fine).
    const nodeCount = (mer.match(/test_CartFeature_addsItem\["addsItem"\]/g) ?? []).length;
    expect(nodeCount).toBe(1);
    expect(mer).toContain(`${acNodeId('CART', 'addItem')} --> ${testNodeId('CartFeature', 'addsItem')}`);
    const dot = renderDot(input);
    expect(dot).toContain(`${acNodeId('CART', 'addItem')} -> ${testNodeId('CartFeature', 'addsItem')}`);

    // Feature-class not found in classToId + featureId empty: falls back to
    // `ref.feature` literal (last leg of the ?? chain on lines 204 / 291).
    const lone: TestRef = {
      feature: 'OrphanFeature', featureId: '', ac: 'lonely',
      testFile: 'x.test.ts', testName: 'lonely', level: 'unit',
    };
    const mer2 = renderMermaid({ requirements: [], features: [feat()], testRefs: [lone], featuresDir: 'f' });
    expect(mer2).toContain(`${acNodeId('OrphanFeature', 'lonely')} --> ${testNodeId('OrphanFeature', 'lonely')}`);
    const dot2 = renderDot({ requirements: [], features: [feat()], testRefs: [lone], featuresDir: 'f' });
    expect(dot2).toContain(`${acNodeId('OrphanFeature', 'lonely')} -> ${testNodeId('OrphanFeature', 'lonely')}`);
  }

  @Verifies<FeatureMermaidGraphFeature>('traceGraphGroupsAcsUnderTheirFeature')
  'wraps AC nodes in a subgraph keyed by feature id'() {
    const out = renderMermaid({
      requirements: [],
      features: [feat()],
      testRefs: [],
      featuresDir: 'f',
    });
    expect(out).toMatch(new RegExp(`subgraph ${featNodeId('CART')} \\["CART: Cart"\\]`));
    // ACs appear between the subgraph header and its `end`.
    const sgIdx = out.indexOf(`subgraph ${featNodeId('CART')}`);
    const endIdx = out.indexOf('\n  end', sgIdx);
    expect(sgIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(sgIdx);
    const block = out.slice(sgIdx, endIdx);
    expect(block).toContain(acNodeId('CART', 'addItem'));
    expect(block).toContain(acNodeId('CART', 'removeItem'));
    // Also render DOT to exercise cluster subgraph branch + test-note branch.
    const dot = renderDot({
      requirements: [{ id: 'REQ-A', title: 't', satisfiedBy: ['CART'], refines: ['REQ-B'] }, { id: 'REQ-B', title: 't', satisfiedBy: [] }],
      features: [feat()],
      testRefs: [ref(), ref({ featureId: '' })],
      featuresDir: 'f',
    });
    expect(dot).toContain(`subgraph cluster_${featNodeId('CART')}`);
    expect(dot).toContain('shape=note');
    expect(dot).toContain(`${reqNodeId('REQ-A')} -> ${reqNodeId('REQ-B')} [style=dashed]`);
    expect(renderGraph({
      requirements: [],
      features: [feat()],
      testRefs: [],
      featuresDir: 'f',
    }, 'dot')).toContain('digraph trace');
    // DOT: unknown satisfiedBy feature id + unknown refines parent are elided.
    const dotElided = renderDot({
      requirements: [
        { id: 'REQ-X', title: 't', satisfiedBy: ['NO-SUCH-FEAT', 'CART'], refines: ['REQ-GHOST'] },
      ],
      features: [feat()],
      testRefs: [],
      featuresDir: 'f',
    });
    expect(dotElided).not.toContain('feat_NO_SUCH_FEAT');
    expect(dotElided).not.toContain(reqNodeId('REQ-GHOST'));
    expect(dotElided).toContain(`${reqNodeId('REQ-X')} -> ${featNodeId('CART')}`);
  }

  @Verifies<FeatureMermaidGraphFeature>('traceGraphRendersRefinesEdgesBetweenRequirements')
  'renders a dashed refines edge from child to parent requirement'() {
    const reqs: RequirementNodeInput[] = [
      { id: 'REQ-PARENT', title: 'parent', satisfiedBy: [] },
      { id: 'REQ-CHILD', title: 'child', satisfiedBy: [], refines: ['REQ-PARENT', 'REQ-UNKNOWN'] },
    ];
    const out = renderMermaid({
      requirements: reqs,
      features: [feat()],
      testRefs: [],
      featuresDir: 'f',
    });
    expect(out).toContain(`${reqNodeId('REQ-CHILD')} -.-> ${reqNodeId('REQ-PARENT')}`);
    // Unknown parent is elided, not rendered
    expect(out).not.toContain(reqNodeId('REQ-UNKNOWN'));
    // Unknown satisfiedBy feature id is elided.
    const out2 = renderMermaid({
      requirements: [{ id: 'REQ-X', title: 't', satisfiedBy: ['NOT-A-FEATURE', 'CART'] }],
      features: [feat()],
      testRefs: [],
      featuresDir: 'f',
    });
    expect(out2).toContain(`${reqNodeId('REQ-X')} --> ${featNodeId('CART')}`);
    expect(out2).not.toContain('feat_NOT_A_FEATURE');
  }

  @Verifies<FeatureMermaidGraphFeature>('traceGraphRefusesUnknownFormatFlag')
  async 'exits 1 with a clear message on unknown --format'() {
    const bad = parseGraphFormat('svg');
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain("Unknown --format 'svg'");
    expect(bad.message).toContain('mermaid');
    expect(bad.message).toContain('dot');
    const ok = parseGraphFormat('mermaid');
    expect(ok.ok).toBe(true);
    expect(ok.format).toBe('mermaid');
    // default (undefined) resolves to mermaid
    expect(parseGraphFormat(undefined).format).toBe('mermaid');
    expect(GRAPH_FORMATS).toEqual(['mermaid', 'dot']);

    // Exit-path via runTraceGraph
    const fsp = realishFs();
    const stdout = mkSink();
    const stderr = mkSink();
    const result = await runTraceGraph(
      { root: '.', featuresDir: '/does/not/exist', format: 'xml' },
      { fs: fsp, stdout, stderr, logger: mkLogger() },
    );
    expect(result.code).toBe(1);
    expect(stderr.buf).toContain("Unknown --format 'xml'");
    expect(stdout.buf).toBe('');
  }

  @Verifies<FeatureMermaidGraphFeature>('traceGraphEmitsWarningWhenCorpusIsEmpty')
  async 'emits a %% no-features warning line and still produces valid mermaid'() {
    await withTmpDir(async dir => {
      // Empty dir → zero features
      const logger = mkLogger();
      const stdout = mkSink();
      const result = await runTraceGraph(
        { root: dir, featuresDir: dir, format: 'mermaid' },
        { fs: realishFs(), stdout, stderr: mkSink(), logger },
      );
      expect(result.code).toBe(0);
      expect(logger.warnings.some(w => w.includes('no features found'))).toBe(true);
      expect(stdout.buf).toContain(`%% no features found in ${dir}`);
      expect(stdout.buf.startsWith('flowchart LR\n')).toBe(true);
      expect(stdout.buf).toContain('classDef covered');

      // Same for DOT
      const stdout2 = mkSink();
      await runTraceGraph(
        { root: dir, featuresDir: dir, format: 'dot' },
        { fs: realishFs(), stdout: stdout2, stderr: mkSink(), logger: mkLogger() },
      );
      expect(stdout2.buf).toContain(`// no features found in ${dir}`);
      expect(stdout2.buf).toContain('digraph trace');
    });
  }

  @Verifies<FeatureMermaidGraphFeature>('traceGraphUsesFileSystemPortForDiscovery')
  async 'discovers features through the FileSystem port (exists check + readFeatures)'() {
    await withTmpDir(async dir => {
      await fs.writeFile(path.join(dir, 'cart.ts'), FEATURE_SRC('CartFeature', 'CART', { acs: ['addItem'] }));
      let existsCalls = 0;
      const baseFs = realishFs();
      const spiedFs: FileSystem = {
        ...baseFs,
        exists: async (p) => { existsCalls++; return baseFs.exists(p); },
      };
      const stdout = mkSink();
      const result = await runTraceGraph(
        { root: dir, featuresDir: dir, format: 'mermaid' },
        { fs: spiedFs, stdout, stderr: mkSink(), logger: mkLogger() },
      );
      expect(result.code).toBe(0);
      expect(existsCalls).toBe(1);
      expect(stdout.buf).toContain(featNodeId('CART'));
      expect(stdout.buf).toContain(acNodeId('CART', 'addItem'));
    });

    // Non-existent dir → exists() returns false, short-circuits readFeatures.
    const nonexistent = path.join(os.tmpdir(), 'req-tracegraph-ghost-' + Date.now());
    const stdout2 = mkSink();
    const logger = mkLogger();
    const result2 = await runTraceGraph(
      { root: nonexistent, featuresDir: nonexistent, format: 'mermaid' },
      { fs: realishFs(), stdout: stdout2, stderr: mkSink(), logger },
    );
    expect(result2.code).toBe(0);
    expect(logger.warnings[0]).toContain('no features found');
    expect(stdout2.buf).toContain(`%% no features found in ${nonexistent}`);
  }

  @Verifies<FeatureMermaidGraphFeature>('traceGraphOutputsToStdoutOrFileFlag')
  async '--output writes via fs port; absent flag writes to stdout'() {
    await withTmpDir(async dir => {
      await fs.writeFile(path.join(dir, 'cart.ts'), FEATURE_SRC('CartFeature', 'CART'));
      const outFile = path.join(dir, 'graph.mmd');
      const stdoutA = mkSink();
      const resultA = await runTraceGraph(
        { root: dir, featuresDir: dir, format: 'mermaid', output: outFile },
        { fs: realishFs(), stdout: stdoutA, stderr: mkSink(), logger: mkLogger() },
      );
      expect(resultA.code).toBe(0);
      expect(resultA.wrote).toBe(outFile);
      expect(stdoutA.buf).toBe('');
      const written = await fs.readFile(outFile, 'utf8');
      expect(written).toContain(featNodeId('CART'));

      const stdoutB = mkSink();
      const resultB = await runTraceGraph(
        { root: dir, featuresDir: dir, format: 'mermaid' },
        { fs: realishFs(), stdout: stdoutB, stderr: mkSink(), logger: mkLogger() },
      );
      expect(resultB.code).toBe(0);
      expect(resultB.wrote).toBeUndefined();
      expect(stdoutB.buf).toContain(featNodeId('CART'));
    });
  }

  @Verifies<FeatureMermaidGraphFeature>('endToEndRendersSelfFeatureCorpusIntoReadme')
  async 'end-to-end: renders the packages/requirements self-feature corpus'() {
    // The self-feature corpus ships at packages/requirements-requirements/src/*.ts
    // (Features and Reqs migrated there as part of the DDD/hexagonal vocabulary refactor.)
    // We point runTraceGraph at it and assert the mermaid embeds the mermaid-graph
    // feature itself (dog-food) so a README block can be generated from stdout.
    const selfDir = path.resolve(__dirname, '../../../requirements-requirements/src');
    const stdout = mkSink();
    const result = await runTraceGraph(
      {
        root: selfDir,
        featuresDir: selfDir,
        format: 'mermaid',
        requirements: [
          { id: 'REQ-VISUAL-TRACEABILITY', title: 'visual trace', satisfiedBy: ['FEATURE-MERMAID-GRAPH'] },
        ],
        testRefs: [
          { feature: 'FeatureMermaidGraphFeature', featureId: 'FEATURE-MERMAID-GRAPH', ac: 'traceGraphEmitsMermaidFlowchart',
            testFile: 'test/unit/trace-graph.test.ts', testName: 'emitsMermaid', level: 'unit' },
        ],
      },
      { fs: realishFs(), stdout, stderr: mkSink(), logger: mkLogger() },
    );
    expect(result.code).toBe(0);
    const out = stdout.buf;
    expect(out).toContain(featNodeId('FEATURE-MERMAID-GRAPH'));
    expect(out).toContain(reqNodeId('REQ-VISUAL-TRACEABILITY'));
    expect(out).toContain(`${reqNodeId('REQ-VISUAL-TRACEABILITY')} --> ${featNodeId('FEATURE-MERMAID-GRAPH')}`);
    // disabled-feature styling applied (the self Feature sets enabled=false).
    expect(out).toContain(`class ${featNodeId('FEATURE-MERMAID-GRAPH')} disabled`);
  }
}

// Reference the class to avoid "unused" under strict builds.
void TraceGraphTests;
