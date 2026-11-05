/**
 * Trace graph — renders the REQ → FEAT → AC → TEST DAG as a Mermaid (default)
 * or Graphviz DOT diagram. Pure core, zero direct I/O: paths flow in via the
 * injected `FileSystem` port; output goes to stdout (via an OutputSink) or to
 * a file (via the same port).
 *
 * Satisfies FEATURE-MERMAID-GRAPH — see
 * `requirements/features/feature-mermaid-graph.ts` and its 10 ACs.
 *
 * Design rules:
 *   S — one function per concern: parse flag, build graph, render mermaid,
 *       render dot, emit.
 *   O — `GraphFormat` is an extensible union; new formats = new renderer.
 *   I — CLI shell depends on `FileSystem`, `OutputSink`, `Logger`; core does
 *       not reach for `fs`/`process`.
 *   D — core takes typed inputs, produces strings; side-effects are the shell's.
 */

import type { FeatureMeta, TestRef } from '@frenchexdev2/requirements-compliance';
import type { FileSystem, Logger, OutputSink } from '@frenchexdev2/requirements-core/ports';
import { readFeatures } from '@frenchexdev2/requirements-compliance';

// ── Public types ────────────────────────────────────────────────────────────

export const GRAPH_FORMATS = ['mermaid', 'dot'] as const;
export type GraphFormat = typeof GRAPH_FORMATS[number];

/** Minimal Requirement shape needed by the graph renderer. */
export interface RequirementNodeInput {
  readonly id: string;
  readonly title: string;
  /** Features satisfying this Requirement (FeatureSpec.id values). */
  readonly satisfiedBy: readonly string[];
  /** Parent Requirements (for `refines` edges). */
  readonly refines?: readonly string[];
}

export interface TraceGraphInput {
  readonly requirements: readonly RequirementNodeInput[];
  readonly features: readonly FeatureMeta[];
  readonly testRefs: readonly TestRef[];
  /** Directory that was scanned for features; used in the empty-corpus warning. */
  readonly featuresDir: string;
}

export interface ParseFormatResult {
  readonly ok: boolean;
  readonly format?: GraphFormat;
  readonly message?: string;
}

// ── Flag parsing ────────────────────────────────────────────────────────────

/**
 * Validate a --format value against the allow-list. Case-sensitive to match
 * the documented flag spelling; unknown values produce an exit-ready message.
 */
export function parseGraphFormat(raw: string | undefined): ParseFormatResult {
  const v = raw ?? 'mermaid';
  if ((GRAPH_FORMATS as readonly string[]).includes(v)) {
    return { ok: true, format: v as GraphFormat };
  }
  return {
    ok: false,
    message: `Unknown --format '${v}'. Allowed: ${GRAPH_FORMATS.join(', ')}.`,
  };
}

// ── Node id helpers ─────────────────────────────────────────────────────────

/** Mermaid & DOT both reject most special characters in bare node ids. */
function sanitize(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_]/g, '_');
}

export function reqNodeId(reqId: string): string { return `req_${sanitize(reqId)}`; }
export function featNodeId(featureId: string): string { return `feat_${sanitize(featureId)}`; }
export function acNodeId(featureId: string, ac: string): string {
  return `ac_${sanitize(featureId)}_${sanitize(ac)}`;
}
export function testNodeId(testClass: string, testName: string): string {
  return `test_${sanitize(testClass)}_${sanitize(testName)}`;
}

/** Escape a label string for inclusion inside `["..."]` in mermaid. */
function escapeLabel(s: string): string {
  return s.replace(/"/g, '&quot;');
}

// ── Coverage classification ─────────────────────────────────────────────────

export interface AcCoverageEntry {
  readonly featureId: string;
  readonly ac: string;
  readonly covered: boolean;
}

/**
 * For every (feature, AC), flag it covered iff at least one TestRef matches
 * by featureId (preferred) or by className-of-feature (fallback). Pure.
 */
export function classifyAcCoverage(
  features: readonly FeatureMeta[],
  testRefs: readonly TestRef[],
): readonly AcCoverageEntry[] {
  const classToId = new Map<string, string>();
  for (const f of features) classToId.set(f.className, f.id);

  const covered = new Set<string>();
  for (const ref of testRefs) {
    const fid = (ref.featureId && ref.featureId !== '')
      ? ref.featureId
      : (classToId.get(ref.feature) ?? ref.feature);
    covered.add(`${fid}|${ref.ac}`);
  }

  const out: AcCoverageEntry[] = [];
  for (const f of features) {
    for (const ac of f.acMethods) {
      out.push({ featureId: f.id, ac, covered: covered.has(`${f.id}|${ac}`) });
    }
  }
  return out;
}

// ── Rendering — Mermaid ─────────────────────────────────────────────────────

const MERMAID_CLASSDEFS = [
  'classDef covered fill:#d1fae5,stroke:#10b981',
  'classDef uncovered fill:#fee2e2,stroke:#ef4444',
  'classDef disabled fill:#e5e7eb,stroke:#9ca3af,stroke-dasharray:5 5',
];

export function renderMermaid(input: TraceGraphInput): string {
  const lines: string[] = [];
  lines.push('flowchart LR');

  if (input.features.length === 0) {
    lines.push(`%% no features found in ${input.featuresDir}`);
    for (const def of MERMAID_CLASSDEFS) lines.push(`  ${def}`);
    return lines.join('\n') + '\n';
  }

  const coverage = classifyAcCoverage(input.features, input.testRefs);
  const coveredKey = new Set(coverage.filter(c => c.covered).map(c => `${c.featureId}|${c.ac}`));

  // ── Requirement nodes ──
  for (const r of input.requirements) {
    lines.push(`  ${reqNodeId(r.id)}["${escapeLabel(r.id)}: ${escapeLabel(r.title)}"]`);
  }

  // ── Feature subgraphs with AC children ──
  for (const f of input.features) {
    lines.push(`  subgraph ${featNodeId(f.id)} ["${escapeLabel(f.id)}: ${escapeLabel(f.title)}"]`);
    for (const ac of f.acMethods) {
      lines.push(`    ${acNodeId(f.id, ac)}["${escapeLabel(ac)}"]`);
    }
    lines.push('  end');
  }

  // ── Test nodes ──
  const testIds = new Set<string>();
  for (const t of input.testRefs) {
    const id = testNodeId(t.feature, t.testName);
    if (testIds.has(id)) continue;
    testIds.add(id);
    lines.push(`  ${id}["${escapeLabel(t.testName)}"]`);
  }

  // ── Edges ──
  // REQ → FEAT (satisfies)
  const featIds = new Set(input.features.map(f => f.id));
  for (const r of input.requirements) {
    for (const fid of r.satisfiedBy) {
      if (!featIds.has(fid)) continue;
      lines.push(`  ${reqNodeId(r.id)} --> ${featNodeId(fid)}`);
    }
  }

  // REQ -.-> REQ_parent (refines — dashed)
  const reqIds = new Set(input.requirements.map(r => r.id));
  for (const r of input.requirements) {
    for (const parent of r.refines ?? []) {
      if (!reqIds.has(parent)) continue;
      lines.push(`  ${reqNodeId(r.id)} -.-> ${reqNodeId(parent)}`);
    }
  }

  // FEAT → AC (specifies) — implicit via subgraph, but we also edge so DAG
  // queries traverse cleanly.
  for (const f of input.features) {
    for (const ac of f.acMethods) {
      lines.push(`  ${featNodeId(f.id)} --> ${acNodeId(f.id, ac)}`);
    }
  }

  // AC → TEST (verifies)
  const classToId = new Map<string, string>();
  for (const f of input.features) classToId.set(f.className, f.id);
  for (const t of input.testRefs) {
    const fid = (t.featureId && t.featureId !== '')
      ? t.featureId
      : (classToId.get(t.feature) ?? t.feature);
    lines.push(`  ${acNodeId(fid, t.ac)} --> ${testNodeId(t.feature, t.testName)}`);
  }

  // ── Classes ──
  for (const def of MERMAID_CLASSDEFS) lines.push(`  ${def}`);

  // Apply coverage / disabled classes on AC nodes
  for (const f of input.features) {
    for (const ac of f.acMethods) {
      const id = acNodeId(f.id, ac);
      const klass = coveredKey.has(`${f.id}|${ac}`) ? 'covered' : 'uncovered';
      lines.push(`  class ${id} ${klass}`);
    }
  }

  // Disabled features — whole subgraph + feature-level node (mermaid applies
  // class to the subgraph node by id).
  for (const f of input.features) {
    if (!f.enabled) lines.push(`  class ${featNodeId(f.id)} disabled`);
  }

  return lines.join('\n') + '\n';
}

// ── Rendering — Graphviz DOT ────────────────────────────────────────────────

export function renderDot(input: TraceGraphInput): string {
  const lines: string[] = [];
  lines.push('digraph trace {');
  lines.push('  rankdir=LR;');

  if (input.features.length === 0) {
    lines.push(`  // no features found in ${input.featuresDir}`);
    lines.push('}');
    return lines.join('\n') + '\n';
  }

  const coverage = classifyAcCoverage(input.features, input.testRefs);
  const coveredKey = new Set(coverage.filter(c => c.covered).map(c => `${c.featureId}|${c.ac}`));

  for (const r of input.requirements) {
    lines.push(`  ${reqNodeId(r.id)} [label="${escapeLabel(r.id)}: ${escapeLabel(r.title)}", shape=box];`);
  }

  for (const f of input.features) {
    const style = f.enabled ? '' : ', style=dashed, color="#9ca3af"';
    lines.push(`  subgraph cluster_${featNodeId(f.id)} {`);
    lines.push(`    label="${escapeLabel(f.id)}: ${escapeLabel(f.title)}"${style};`);
    for (const ac of f.acMethods) {
      const covered = coveredKey.has(`${f.id}|${ac}`);
      const fill = covered ? '#d1fae5' : '#fee2e2';
      const stroke = covered ? '#10b981' : '#ef4444';
      lines.push(`    ${acNodeId(f.id, ac)} [label="${escapeLabel(ac)}", style=filled, fillcolor="${fill}", color="${stroke}"];`);
    }
    lines.push('  }');
  }

  const testIds = new Set<string>();
  for (const t of input.testRefs) {
    const id = testNodeId(t.feature, t.testName);
    if (testIds.has(id)) continue;
    testIds.add(id);
    lines.push(`  ${id} [label="${escapeLabel(t.testName)}", shape=note];`);
  }

  const featIds = new Set(input.features.map(f => f.id));
  for (const r of input.requirements) {
    for (const fid of r.satisfiedBy) {
      if (!featIds.has(fid)) continue;
      lines.push(`  ${reqNodeId(r.id)} -> ${featNodeId(fid)};`);
    }
  }

  const reqIds = new Set(input.requirements.map(r => r.id));
  for (const r of input.requirements) {
    for (const parent of r.refines ?? []) {
      if (!reqIds.has(parent)) continue;
      lines.push(`  ${reqNodeId(r.id)} -> ${reqNodeId(parent)} [style=dashed];`);
    }
  }

  const classToId = new Map<string, string>();
  for (const f of input.features) classToId.set(f.className, f.id);
  for (const t of input.testRefs) {
    const fid = (t.featureId && t.featureId !== '')
      ? t.featureId
      : (classToId.get(t.feature) ?? t.feature);
    lines.push(`  ${acNodeId(fid, t.ac)} -> ${testNodeId(t.feature, t.testName)};`);
  }

  lines.push('}');
  return lines.join('\n') + '\n';
}

// ── Top-level render ────────────────────────────────────────────────────────

export function renderGraph(input: TraceGraphInput, format: GraphFormat): string {
  return format === 'dot' ? renderDot(input) : renderMermaid(input);
}

// ── CLI-facing entry ────────────────────────────────────────────────────────

export interface RunTraceGraphOptions {
  readonly root: string;
  readonly featuresDir: string;
  readonly format?: string;
  readonly output?: string;
  readonly requirements?: readonly RequirementNodeInput[];
  readonly testRefs?: readonly TestRef[];
}

export interface RunTraceGraphResult {
  readonly code: number;
  readonly wrote?: string;
}

/**
 * Thin orchestration: validate --format, discover features via the FileSystem
 * port, render the graph, and either write to stdout or to a file (also via
 * the FileSystem port).
 */
export async function runTraceGraph(
  opts: RunTraceGraphOptions,
  ports: { fs: FileSystem; stdout: OutputSink; stderr: OutputSink; logger: Logger },
): Promise<RunTraceGraphResult> {
  const parsed = parseGraphFormat(opts.format);
  if (!parsed.ok) {
    ports.stderr.write(parsed.message + '\n');
    return { code: 1 };
  }
  const format = parsed.format!;

  // Discover features via the FileSystem port. readFeatures uses fs/promises
  // directly; in tests we inject a memory FS by writing to a tmp dir OR we
  // bypass discovery by passing features explicitly through a direct call to
  // renderGraph. The port is still exercised here for `exists`.
  const dirExists = await ports.fs.exists(opts.featuresDir);
  const features: readonly FeatureMeta[] = dirExists ? await readFeatures(opts.featuresDir) : [];

  if (features.length === 0) {
    ports.logger.warn(`no features found in ${opts.featuresDir}`);
  }

  const input: TraceGraphInput = {
    requirements: opts.requirements ?? [],
    features,
    testRefs: opts.testRefs ?? [],
    featuresDir: opts.featuresDir,
  };

  const rendered = renderGraph(input, format);

  if (opts.output) {
    await ports.fs.writeFile(opts.output, rendered);
    return { code: 0, wrote: opts.output };
  }

  ports.stdout.write(rendered);
  return { code: 0 };
}
