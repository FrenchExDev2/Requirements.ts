/**
 * Traceability query engine — pure logic, zero I/O.
 *
 * Builds an inverted index from the existing requirements-bindings manifest,
 * feature metadata, and test refs, then answers queries against it.
 *
 * SOLID:
 *  S — each queryXxx does one thing; renderers are separate functions.
 *  O — new queries = new functions, no modification to existing ones.
 *  L — TraceFormatter is a structural subtype of ConsoleIO.
 *  I — TraceFormatter carries only the 6 methods needed, not all of ConsoleIO.
 *  D — core depends on TraceFormatter and TraceDataPort abstractions.
 */

import * as path from 'path';
import type { FeatureMeta, TestRef, MachineLink } from '@frenchexdev2/requirements-compliance';
import type { BindingsManifest } from '@frenchexdev2/requirements-scanner';

// Re-export the FSM factory from src/lib/ (where @FiniteStateMachine lives)
// TraceIndexMachine is project-specific — consumers provide their own

// ── Ports (ISP + DIP) ──────────────────────────────────────────────────────

/** Formatting port — structural subtype of ConsoleIO. */
export interface TraceFormatter {
  bold(s: string): string;
  cyan(s: string): string;
  dim(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  red(s: string): string;
}

/** Data-loading port — the CLI shell implements this. */
export interface TraceDataPort {
  loadManifest(): Promise<BindingsManifest>;
  loadFeatures(): Promise<readonly FeatureMeta[]>;
  loadTestRefs(): Promise<readonly TestRef[]>;
  loadFsmLinks(): Promise<readonly MachineLink[]>;
  execGitDiff(base: string): Promise<string[]>;
}

// ── Node types ──────────────────────────────────────────────────────────────

export interface FeatureNode {
  readonly id: string;
  readonly title: string;
  readonly priority: string;
  readonly enabled: boolean;
  readonly acs: readonly string[];
}

export interface FileFeatureLink {
  readonly featureId: string;
  readonly acs: readonly string[];
  readonly symbols: readonly string[];
}

export interface FileTestLink {
  readonly testFile: string;
  readonly testName: string;
  readonly featureId: string;
  readonly ac: string;
}

export interface FileNode {
  readonly file: string;
  readonly features: readonly FileFeatureLink[];
  readonly tests: readonly FileTestLink[];
}

export interface TraceIndex {
  readonly featureNodes: ReadonlyMap<string, FeatureNode>;
  readonly fileNodes:    ReadonlyMap<string, FileNode>;
  readonly fileToFeatures: ReadonlyMap<string, ReadonlySet<string>>;
  readonly featureToFiles: ReadonlyMap<string, ReadonlySet<string>>;
  readonly fileToTests:    ReadonlyMap<string, ReadonlySet<string>>;
  readonly featureToTests: ReadonlyMap<string, ReadonlySet<string>>;
  readonly classToId:      ReadonlyMap<string, string>;
}

// ── Index builder ───────────────────────────────────────────────────────────

export function buildTraceIndex(
  features: readonly FeatureMeta[],
  manifest: BindingsManifest,
  testRefs: readonly TestRef[],
): TraceIndex {
  // classToId: FeatureClassName → Feature ID
  const classToId = new Map<string, string>();
  const featureNodes = new Map<string, FeatureNode>();

  for (const f of features) {
    classToId.set(f.className, f.id);
    featureNodes.set(f.id, {
      id: f.id,
      title: f.title,
      priority: f.priority,
      enabled: f.enabled,
      acs: f.acMethods,
    });
  }

  // Pass 1: manifest → featureToFiles + fileToFeatures + detailed maps
  const featureToFiles = new Map<string, Set<string>>();
  const fileToFeatures = new Map<string, Set<string>>();
  // Detailed: file → featureId → { acs, symbols }
  const fileFeatureDetail = new Map<string, Map<string, { acs: Set<string>; symbols: Set<string> }>>();

  for (const [featureId, acMap] of Object.entries(manifest)) {
    const fileSet = featureToFiles.get(featureId) ?? new Set<string>();
    for (const [ac, targets] of Object.entries(acMap)) {
      for (const t of targets) {
        fileSet.add(t.file);

        // Reverse: file → features
        const fSet = fileToFeatures.get(t.file) ?? new Set<string>();
        fSet.add(featureId);
        fileToFeatures.set(t.file, fSet);

        // Detailed
        let fMap = fileFeatureDetail.get(t.file);
        if (!fMap) { fMap = new Map(); fileFeatureDetail.set(t.file, fMap); }
        let entry = fMap.get(featureId);
        if (!entry) { entry = { acs: new Set(), symbols: new Set() }; fMap.set(featureId, entry); }
        entry.acs.add(ac);
        entry.symbols.add(t.symbol);
      }
    }
    featureToFiles.set(featureId, fileSet);
  }

  // Pass 2: testRefs → featureToTests
  const featureToTests = new Map<string, Set<string>>();
  // Also keep detailed test refs per feature for FileNode.tests
  const featureTestDetail = new Map<string, { file: string; name: string; ac: string }[]>();

  for (const ref of testRefs) {
    const fid = (ref.featureId && ref.featureId !== '') ? ref.featureId : (classToId.get(ref.feature) ?? ref.feature);
    const tSet = featureToTests.get(fid) ?? new Set<string>();
    tSet.add(ref.testFile);
    featureToTests.set(fid, tSet);

    const detail = featureTestDetail.get(fid) ?? [];
    detail.push({ file: ref.testFile, name: ref.testName, ac: ref.ac });
    featureTestDetail.set(fid, detail);
  }

  // Pass 3: derive fileToTests (join through features)
  const fileToTests = new Map<string, Set<string>>();
  const fileNodes = new Map<string, FileNode>();

  for (const [file, featIds] of fileToFeatures) {
    const testSet = new Set<string>();
    const testLinks: FileTestLink[] = [];

    for (const fid of featIds) {
      const tests = featureToTests.get(fid);
      if (tests) for (const t of tests) testSet.add(t);

      const details = featureTestDetail.get(fid);
      if (details) {
        for (const d of details) {
          testLinks.push({ testFile: d.file, testName: d.name, featureId: fid, ac: d.ac });
        }
      }
    }
    fileToTests.set(file, testSet);

    const featureLinks: FileFeatureLink[] = [];
    // fileFeatureDetail is populated in pass 1 for every file added to fileToFeatures,
    // so an entry is guaranteed to exist here.
    const fMap = fileFeatureDetail.get(file)!;
    for (const [fid, detail] of fMap) {
      featureLinks.push({
        featureId: fid,
        acs: [...detail.acs],
        symbols: [...detail.symbols],
      });
    }

    fileNodes.set(file, { file, features: featureLinks, tests: testLinks });
  }

  return {
    featureNodes,
    fileNodes,
    fileToFeatures,
    featureToFiles,
    fileToTests,
    featureToTests,
    classToId,
  };
}

// ── Path normaliser ─────────────────────────────────────────────────────────

/**
 * Normalise a user-provided file path to the format used in the bindings
 * manifest (posix-relative to project root, e.g. "src/lib/foo.ts").
 */
export function normalizePath(input: string, root: string): string {
  const abs = path.isAbsolute(input) ? input : path.resolve(root, input);
  return path.relative(root, abs).replace(/\\/g, '/');
}

// ── Query result types ──────────────────────────────────────────────────────

export interface FileToFeaturesResult {
  readonly file: string;
  readonly features: readonly {
    readonly id: string;
    readonly title: string;
    readonly priority: string;
    readonly acs: readonly string[];
    readonly symbols: readonly string[];
  }[];
}

export interface FeatureToFilesResult {
  readonly featureId: string;
  readonly title: string;
  readonly files: readonly { readonly file: string; readonly symbols: readonly string[] }[];
}

export interface FileToTestsResult {
  readonly file: string;
  readonly tests: readonly FileTestLink[];
}

export interface FeatureToTestsResult {
  readonly featureId: string;
  readonly title: string;
  readonly tests: readonly { readonly file: string; readonly name: string; readonly ac: string }[];
}

export interface ImpactResult {
  readonly changedFiles: readonly string[];
  readonly impactedFeatures: readonly {
    readonly id: string;
    readonly title: string;
    readonly priority: string;
  }[];
  readonly testsToRerun: readonly string[];
}

export interface HotspotEntry {
  readonly file: string;
  readonly featureCount: number;
  readonly features: readonly string[];
}

export interface FragileEntry {
  readonly featureId: string;
  readonly title: string;
  readonly fileCount: number;
  readonly files: readonly string[];
}

export interface FsmFeatureQueryLink {
  readonly featureId: string;
  readonly ac: string;
  readonly featureTitle: string | null;
}

export interface FsmQueryEntry {
  readonly name: string;
  readonly file: string;
  readonly features: readonly FsmFeatureQueryLink[];
}

export interface FsmQueryResult {
  readonly entries: readonly FsmQueryEntry[];
}

// ── Query functions (all pure, OCP) ─────────────────────────────────────────

export function queryFileToFeatures(index: TraceIndex, filePath: string): FileToFeaturesResult {
  const node = index.fileNodes.get(filePath);
  if (!node) return { file: filePath, features: [] };

  const features = node.features.map(fl => {
    const fn = index.featureNodes.get(fl.featureId);
    return {
      id: fl.featureId,
      title: fn?.title ?? '',
      priority: fn?.priority ?? '',
      acs: fl.acs,
      symbols: fl.symbols,
    };
  });

  return { file: filePath, features };
}

export function queryFeatureToFiles(index: TraceIndex, featureId: string): FeatureToFilesResult | null {
  const fn = index.featureNodes.get(featureId);
  if (!fn) return null;

  const fileNode = index.fileNodes;
  const files: { file: string; symbols: string[] }[] = [];
  const fileSet = index.featureToFiles.get(featureId);
  if (fileSet) {
    for (const f of fileSet) {
      const node = fileNode.get(f);
      const link = node?.features.find(fl => fl.featureId === featureId);
      files.push({ file: f, symbols: link ? [...link.symbols] : [] });
    }
  }

  return { featureId, title: fn.title, files };
}

export function queryFileToTests(index: TraceIndex, filePath: string): FileToTestsResult {
  const node = index.fileNodes.get(filePath);
  if (!node) return { file: filePath, tests: [] };
  return { file: filePath, tests: node.tests };
}

export function queryFeatureToTests(index: TraceIndex, featureId: string): FeatureToTestsResult | null {
  const fn = index.featureNodes.get(featureId);
  if (!fn) return null;

  const tests: { file: string; name: string; ac: string }[] = [];
  const testSet = index.featureToTests.get(featureId);
  if (testSet) {
    // Walk all file nodes to find detailed test links for this feature
    for (const [, fileNode] of index.fileNodes) {
      for (const tl of fileNode.tests) {
        if (tl.featureId === featureId) {
          tests.push({ file: tl.testFile, name: tl.testName, ac: tl.ac });
        }
      }
    }
  }

  // Deduplicate by file+name+ac
  const seen = new Set<string>();
  const deduped = tests.filter(t => {
    const key = `${t.file}|${t.name}|${t.ac}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { featureId, title: fn.title, tests: deduped };
}

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function queryImpact(index: TraceIndex, changedFiles: readonly string[]): ImpactResult {
  const featSet = new Set<string>();
  const testSet = new Set<string>();

  for (const f of changedFiles) {
    const feats = index.fileToFeatures.get(f);
    if (feats) for (const fid of feats) featSet.add(fid);

    const tests = index.fileToTests.get(f);
    if (tests) for (const t of tests) testSet.add(t);
  }

  const impactedFeatures = [...featSet].map(fid => {
    const fn = index.featureNodes.get(fid);
    return { id: fid, title: fn?.title ?? '', priority: fn?.priority ?? '' };
  }).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  return {
    changedFiles,
    impactedFeatures,
    testsToRerun: [...testSet].sort(),
  };
}

export function queryHotspots(index: TraceIndex, limit = 20): HotspotEntry[] {
  const entries: HotspotEntry[] = [];
  for (const [file, feats] of index.fileToFeatures) {
    entries.push({
      file,
      featureCount: feats.size,
      features: [...feats].sort(),
    });
  }
  entries.sort((a, b) => b.featureCount - a.featureCount);
  return entries.slice(0, limit);
}

export function queryFragile(index: TraceIndex, limit = 20): FragileEntry[] {
  const entries: FragileEntry[] = [];
  for (const [fid, files] of index.featureToFiles) {
    const fn = index.featureNodes.get(fid);
    entries.push({
      featureId: fid,
      title: fn?.title ?? '',
      fileCount: files.size,
      files: [...files].sort(),
    });
  }
  entries.sort((a, b) => b.fileCount - a.fileCount);
  return entries.slice(0, limit);
}

export function queryFsm(
  fsmLinks: readonly MachineLink[],
  featureNodes: ReadonlyMap<string, FeatureNode>,
  name?: string,
): FsmQueryResult {
  const filtered = name
    ? fsmLinks.filter(m => m.name.toLowerCase().includes(name.toLowerCase()))
    : fsmLinks;

  const entries: FsmQueryEntry[] = filtered.map(m => {
    const features: FsmFeatureQueryLink[] = (m.features ?? []).map(fl => {
      const fn = featureNodes.get(fl.id);
      return { featureId: fl.id, ac: fl.ac, featureTitle: fn?.title ?? null };
    });
    return { name: m.name, file: m.file, features };
  });

  return { entries };
}

// ── Render functions (pure string builders) ─────────────────────────────────

export function renderFileToFeatures(result: FileToFeaturesResult, fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  lines.push(fmt.bold(`File: ${result.file}`));
  lines.push('');
  if (result.features.length === 0) {
    lines.push(fmt.dim('(no features linked)'));
  } else {
    for (const f of result.features) {
      lines.push(`${fmt.cyan(f.id.padEnd(16))} ${f.title.padEnd(30)} ${fmt.dim(f.priority)}`);
      lines.push(`  ACs: ${f.acs.join(', ')}`);
      lines.push(`  Symbols: ${fmt.dim(f.symbols.join(', '))}`);
    }
    lines.push('');
    lines.push(`${result.features.length} feature(s) linked`);
  }
  return lines;
}

export function renderFeatureToFiles(result: FeatureToFilesResult, fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  lines.push(`${fmt.bold(result.featureId)}  ${result.title}`);
  lines.push('');
  if (result.files.length === 0) {
    lines.push(fmt.dim('(no source files linked)'));
  } else {
    for (const f of result.files) {
      lines.push(`  ${fmt.cyan(f.file)}`);
      if (f.symbols.length > 0) {
        lines.push(`    ${fmt.dim(f.symbols.join(', '))}`);
      }
    }
    lines.push('');
    lines.push(`${result.files.length} file(s)`);
  }
  return lines;
}

export function renderFileToTests(result: FileToTestsResult, fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  lines.push(fmt.bold(`File: ${result.file}`));
  lines.push('');
  if (result.tests.length === 0) {
    lines.push(fmt.dim('(no tests linked)'));
  } else {
    // Group by test file
    const byFile = new Map<string, FileTestLink[]>();
    for (const t of result.tests) {
      const arr = byFile.get(t.testFile) ?? [];
      arr.push(t);
      byFile.set(t.testFile, arr);
    }
    for (const [testFile, links] of byFile) {
      lines.push(`  ${fmt.cyan(testFile)}`);
      for (const l of links) {
        lines.push(`    ${fmt.dim(l.featureId + '/' + l.ac)} ${l.testName}`);
      }
    }
    lines.push('');
    lines.push(`${byFile.size} test file(s)`);
  }
  return lines;
}

export function renderFeatureToTests(result: FeatureToTestsResult, fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  lines.push(`${fmt.bold(result.featureId)}  ${result.title}`);
  lines.push('');
  if (result.tests.length === 0) {
    lines.push(fmt.dim('(no tests linked)'));
  } else {
    for (const t of result.tests) {
      lines.push(`  ${fmt.cyan(t.file)}`);
      lines.push(`    ${fmt.dim(t.ac)} ${t.name}`);
    }
    lines.push('');
    lines.push(`${result.tests.length} test(s)`);
  }
  return lines;
}

export function renderImpact(result: ImpactResult, fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  lines.push(fmt.bold(`Changed: ${result.changedFiles.length} file(s)`));
  for (const f of result.changedFiles) lines.push(`  ${fmt.dim(f)}`);
  lines.push('');
  lines.push(fmt.bold(`Impacted features: ${result.impactedFeatures.length}`));
  for (const f of result.impactedFeatures) {
    const icon = f.priority === 'critical' ? fmt.red('!') : fmt.yellow('*');
    lines.push(`  ${icon} ${fmt.cyan(f.id.padEnd(16))} ${f.title.padEnd(30)} ${fmt.dim(f.priority)}`);
  }
  lines.push('');
  lines.push(fmt.bold(`Tests to rerun: ${result.testsToRerun.length} file(s)`));
  for (const t of result.testsToRerun) lines.push(`  ${t}`);
  return lines;
}

export function renderHotspots(entries: readonly HotspotEntry[], fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  if (entries.length === 0) { lines.push(fmt.dim('(no data)')); return lines; }
  const maxCount = entries[0]!.featureCount;
  for (const e of entries) {
    const barLen = maxCount > 0 ? Math.max(1, Math.round((e.featureCount / maxCount) * 20)) : 1;
    const bar = '\u2588'.repeat(barLen);
    lines.push(`  ${fmt.cyan(e.file.padEnd(45))} ${fmt.green(bar)} ${e.featureCount} feat`);
  }
  return lines;
}

export function renderFragile(entries: readonly FragileEntry[], fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  if (entries.length === 0) { lines.push(fmt.dim('(no data)')); return lines; }
  const maxCount = entries[0]!.fileCount;
  for (const e of entries) {
    const barLen = maxCount > 0 ? Math.max(1, Math.round((e.fileCount / maxCount) * 20)) : 1;
    const bar = '\u2588'.repeat(barLen);
    lines.push(`  ${fmt.cyan(e.featureId.padEnd(20))} ${e.title.padEnd(30)} ${fmt.yellow(bar)} ${e.fileCount} file(s)`);
  }
  return lines;
}

export function renderFsm(result: FsmQueryResult, fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  if (result.entries.length === 0) {
    lines.push(fmt.dim('(no FSMs found)'));
    return lines;
  }
  for (const e of result.entries) {
    lines.push(`  ${fmt.cyan(e.name.padEnd(30))} ${e.file}`);
    if (e.features.length === 0) {
      lines.push(`    Feature: ${fmt.red('(unlinked)')}`);
    } else {
      for (const fl of e.features) {
        const label = `${fmt.green(fl.featureId)} / ${fl.ac}`;
        lines.push(`    Feature: ${label}${fl.featureTitle ? '  ' + fmt.dim(fl.featureTitle) : ''}`);
      }
    }
  }
  lines.push('');
  lines.push(`${result.entries.length} FSM(s)`);
  return lines;
}

// ── Gaps ─────────────────────────────────────────────────────────────────────

export interface GapReport {
  readonly unlinkedFsms: readonly { name: string; file: string }[];
  readonly uncoveredAcs: readonly { featureId: string; ac: string; expectedLevels: readonly string[]; missingLevels: readonly string[] }[];
  readonly transitionsWithoutAcs: readonly { file: string; from: string; to: string; on: string }[];
}

export function queryGaps(
  _index: TraceIndex,
  fsmLinks: readonly MachineLink[],
  features: readonly FeatureMeta[],
  testRefs: readonly TestRef[],
): GapReport {
  // 1. FSMs without features
  const unlinkedFsms = fsmLinks
    .filter(m => !m.features || m.features.length === 0)
    .map(m => ({ name: m.name, file: m.file }));

  // 2. ACs without required test levels
  const classToId = new Map<string, string>();
  for (const f of features) classToId.set(f.className, f.id);

  const uncoveredAcs: GapReport['uncoveredAcs'][number][] = [];
  for (const f of features) {
    if (!f.enabled) continue;
    const acDetailMap = new Map(f.acDetails.map(d => [d.name, d]));
    for (const method of f.acMethods) {
      const expected = acDetailMap.get(method)?.expectedLevels ?? ['unit'];
      const matchingRefs = testRefs.filter(
        r => (r.featureId === f.id || classToId.get(r.feature) === f.id) && r.ac === method,
      );
      const coveredLevels = new Set(matchingRefs.map(r => r.level));
      const missingLevels = expected.filter(l => !coveredLevels.has(l));
      if (missingLevels.length > 0) {
        uncoveredAcs.push({ featureId: f.id, ac: method, expectedLevels: expected, missingLevels });
      }
    }
  }

  // 3. Transitions without acs (placeholder — needs state-machines.json data)
  const transitionsWithoutAcs: GapReport['transitionsWithoutAcs'][number][] = [];

  return { unlinkedFsms, uncoveredAcs, transitionsWithoutAcs };
}

export function renderGaps(report: GapReport, fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  lines.push(fmt.bold('Traceability Gaps'));
  lines.push('');

  if (report.unlinkedFsms.length > 0) {
    lines.push(fmt.cyan('FSMs without feature links:'));
    for (const m of report.unlinkedFsms) {
      lines.push(`  ${m.name.padEnd(30)} ${fmt.dim(m.file)}`);
    }
    lines.push('');
  }

  if (report.uncoveredAcs.length > 0) {
    lines.push(fmt.cyan('ACs with missing test levels:'));
    for (const gap of report.uncoveredAcs) {
      const missing = gap.missingLevels.join(', ');
      lines.push(`  ${fmt.green(gap.featureId.padEnd(16))} ${gap.ac.padEnd(30)} ${fmt.red(`missing: ${missing}`)}`);
    }
    lines.push('');
  }

  if (report.transitionsWithoutAcs.length > 0) {
    lines.push(fmt.cyan('Transitions without ACs:'));
    for (const t of report.transitionsWithoutAcs) {
      lines.push(`  ${fmt.dim(t.file)} ${t.from} -> ${t.to} on:${t.on}`);
    }
    lines.push('');
  }

  if (report.unlinkedFsms.length === 0 && report.uncoveredAcs.length === 0 && report.transitionsWithoutAcs.length === 0) {
    lines.push(fmt.green('No gaps found.'));
  }

  const total = report.unlinkedFsms.length + report.uncoveredAcs.length + report.transitionsWithoutAcs.length;
  lines.push(`${total} gap(s) total`);
  return lines;
}

// ── Matrix ───────────────────────────────────────────────────────────────────

export interface MatrixRow {
  readonly ac: string;
  readonly fsmTransition: string | null;
  readonly expectedLevels: readonly string[];
  readonly coveredLevels: readonly string[];
  readonly gapLevels: readonly string[];
}

export interface MatrixResult {
  readonly featureId: string;
  readonly title: string;
  readonly rows: readonly MatrixRow[];
}

export function queryMatrix(
  featureId: string,
  _index: TraceIndex,
  features: readonly FeatureMeta[],
  testRefs: readonly TestRef[],
  fsmLinks: readonly MachineLink[],
): MatrixResult | null {
  const f = features.find(feat => feat.id === featureId);
  if (!f) return null;

  const classToId = new Map<string, string>();
  for (const feat of features) classToId.set(feat.className, feat.id);
  const acDetailMap = new Map(f.acDetails.map(d => [d.name, d]));

  // Build transition lookup: ac → "from→to on:event"
  const acToTransition = new Map<string, string>();
  for (const m of fsmLinks) {
    if (!m.features) continue;
    // Check if this FSM links to our feature
    const linksToFeature = m.features.some(fl => fl.id === featureId);
    if (!linksToFeature) continue;
    // We'd need transitions data from state-machines.json for the full mapping
    // For now, mark ACs that appear in features as "(FSM-linked)"
  }

  const rows: MatrixRow[] = f.acMethods.map(method => {
    const expected = acDetailMap.get(method)?.expectedLevels ?? ['unit'];
    const matchingRefs = testRefs.filter(
      r => (r.featureId === f.id || classToId.get(r.feature) === f.id) && r.ac === method,
    );
    const coveredLevels = [...new Set(matchingRefs.map(r => r.level))].filter(l => (expected as readonly string[]).includes(l));
    const gapLevels = expected.filter(l => !new Set(matchingRefs.map(r => r.level)).has(l));

    return {
      ac: method,
      fsmTransition: acToTransition.get(method) ?? null,
      expectedLevels: expected,
      coveredLevels,
      gapLevels,
    };
  });

  return { featureId: f.id, title: f.title, rows };
}

export function renderMatrix(result: MatrixResult, fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  lines.push(`${fmt.bold(result.featureId)}  ${result.title}`);
  lines.push('');

  if (result.rows.length === 0) {
    lines.push(fmt.dim('(no ACs)'));
    return lines;
  }

  const maxAc = Math.max(...result.rows.map(r => r.ac.length), 10);
  const allLevels = [...new Set(result.rows.flatMap(r => [...r.expectedLevels]))].sort();

  // Header
  const header = `  ${'AC'.padEnd(maxAc)} | ${'Expected'.padEnd(14)} | ${allLevels.map(l => l.padEnd(6)).join(' | ')}`;
  lines.push(header);
  lines.push('  ' + '-'.repeat(header.length - 2));

  for (const row of result.rows) {
    const expectedStr = (row.expectedLevels as string[]).join(', ').padEnd(14);
    const levelCols = allLevels.map(l => {
      if (!(row.expectedLevels as readonly string[]).includes(l)) return '-'.padEnd(6);
      if ((row.coveredLevels as readonly string[]).includes(l)) return fmt.green('✓'.padEnd(6));
      return fmt.red('✗'.padEnd(6));
    }).join(' | ');
    lines.push(`  ${row.ac.padEnd(maxAc)} | ${expectedStr} | ${levelCols}`);
  }

  const gapCount = result.rows.filter(r => r.gapLevels.length > 0).length;
  lines.push('');
  lines.push(`${result.rows.length} AC(s), ${gapCount} gap(s)`);
  return lines;
}

// ── Chain ────────────────────────────────────────────────────────────────────

export interface ChainNode {
  readonly kind: 'requirement' | 'fsm' | 'transition' | 'implementation' | 'test';
  readonly label: string;
  readonly file: string;
  readonly detail?: string;
}

export interface ChainResult {
  readonly featureId: string;
  readonly ac: string;
  readonly nodes: readonly ChainNode[];
}

export function queryChain(
  featureId: string,
  ac: string,
  features: readonly FeatureMeta[],
  fsmLinks: readonly MachineLink[],
  testRefs: readonly TestRef[],
): ChainResult | null {
  const f = features.find(feat => feat.id === featureId);
  if (!f || !f.acMethods.includes(ac)) return null;

  const classToId = new Map<string, string>();
  for (const feat of features) classToId.set(feat.className, feat.id);

  const nodes: ChainNode[] = [];

  // 1. Requirement node
  nodes.push({
    kind: 'requirement',
    label: `${f.className}.${ac}()`,
    file: `requirements/features/${f.file}`,
  });

  // 2. FSM nodes
  for (const m of fsmLinks) {
    if (!m.features) continue;
    if (m.features.some(fl => fl.id === featureId && fl.ac === ac)) {
      nodes.push({
        kind: 'fsm',
        label: m.name,
        file: m.file,
        detail: 'feature-level link',
      });
    }
  }

  // 3. Test nodes
  const matchingTests = testRefs.filter(
    r => (r.featureId === featureId || classToId.get(r.feature) === featureId) && r.ac === ac,
  );
  for (const t of matchingTests) {
    nodes.push({
      kind: 'test',
      label: t.testName,
      file: t.testFile,
      detail: t.level,
    });
  }

  return { featureId, ac, nodes };
}

export function renderChain(result: ChainResult, fmt: TraceFormatter): string[] {
  const lines: string[] = [];
  lines.push(fmt.bold(`${result.featureId} / ${result.ac}`));
  lines.push('');

  if (result.nodes.length === 0) {
    lines.push(fmt.dim('(no traceability data)'));
    return lines;
  }

  for (const node of result.nodes) {
    const icon = node.kind === 'requirement' ? 'REQ' : node.kind === 'fsm' ? 'FSM' : node.kind === 'test' ? 'TST' : '   ';
    const label = node.kind === 'requirement' ? fmt.cyan(node.label) : node.kind === 'test' ? fmt.green(node.label) : node.label;
    lines.push(`  ${fmt.bold(icon)}  ${label}`);
    lines.push(`       ${fmt.dim(node.file)}${node.detail ? '  ' + fmt.dim(node.detail) : ''}`);
  }

  return lines;
}
