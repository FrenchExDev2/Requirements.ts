/**
 * rename-core tests — dog-food the DSL: every test is an AC verification via
 * @FeatureTest + @Verifies. No bare describe/it.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureRenameCodemodFeature } from '@frenchexdev2/requirements-requirements';
import {
  runRename,
  renameFeature,
  renameRequirement,
  renameAc,
  RenameError,
  formatRenameDiagnostic,
  type RenameOptions,
} from '@frenchexdev2/requirements-core/rename-core';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';

// ── In-memory FileSystem port ───────────────────────────────────────────────

interface MemFs extends FileSystem {
  files: Map<string, string>;
  writes: { path: string; content: string }[];
  unlinks: string[];
}

function mkFs(seed: Record<string, string>): MemFs {
  const files = new Map<string, string>(Object.entries(seed));
  const writes: { path: string; content: string }[] = [];
  const unlinks: string[] = [];
  return {
    files,
    writes,
    unlinks,
    readFile: async (p: string) => {
      if (!files.has(p)) throw new Error(`ENOENT ${p}`);
      return files.get(p)!;
    },
    writeFile: async (p: string, c: string) => {
      writes.push({ path: p, content: c });
      files.set(p, c);
    },
    exists: async (p: string) => files.has(p),
    readdir: async (p: string) => {
      const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
      const kids = new Set<string>();
      for (const key of files.keys()) {
        const k = key.replace(/\\/g, '/');
        if (!k.startsWith(norm + '/')) continue;
        const rest = k.slice(norm.length + 1);
        const head = rest.split('/')[0]!;
        kids.add(head);
      }
      return [...kids];
    },
    stat: async (p: string) => {
      const norm = p.replace(/\\/g, '/');
      const isDir = ![...files.keys()].some(k => k.replace(/\\/g, '/') === norm);
      return {
        mtimeMs: 0,
        size: isDir ? 0 : (files.get(p)?.length ?? 0),
        isDirectory: () => isDir,
      };
    },
    mkdir: async () => {},
    unlink: async (p: string) => {
      unlinks.push(p);
      files.delete(p);
    },
  };
}

const BASE_CTX: Omit<RenameOptions, 'kind' | 'oldId' | 'newId'> = {
  root: '/proj',
  scanDirs: ['/proj/test/unit'],
  featuresDir: '/proj/requirements/features',
  requirementsDir: '/proj/requirements/requirements',
};

function featureSrc(className: string, id: string, acs: string[] = ['firstAc']): string {
  return [
    `import { Feature, Priority, type ACResult } from '@frenchexdev2/requirements';`,
    `export abstract class ${className} extends Feature {`,
    `  readonly id = '${id}';`,
    `  readonly title = 'T';`,
    `  readonly priority = Priority.Medium;`,
    ...acs.map(a => `  abstract ${a}(): ACResult;`),
    `}`,
    '',
  ].join('\n');
}

function featureSpec(id: string, acs: string[] = ['firstAc']): string {
  return JSON.stringify(
    {
      $schemaVersion: '2026-04-14',
      kind: 'feature',
      id,
      title: 'T',
      priority: 'medium',
      acs: acs.map(a => ({ name: a, expects: ['unit'] })),
    },
    null,
    2,
  );
}

function requirementSrc(className: string, id: string): string {
  return [
    `import { Requirement, Priority } from '@frenchexdev2/requirements';`,
    `export abstract class ${className} extends Requirement<any> {`,
    `  readonly id = '${id}';`,
    `  readonly title = 'T';`,
    `  readonly priority = Priority.Medium;`,
    `}`,
    '',
  ].join('\n');
}

function requirementSpec(id: string): string {
  return JSON.stringify(
    { $schemaVersion: '2026-04-14', kind: 'requirement', id, title: 'T' },
    null,
    2,
  );
}

function testSrc(refs: Array<{ feat: string; ac: string }>, className = 'SomeTest'): string {
  const imports = new Set(refs.map(r => r.feat));
  const body: string[] = [];
  body.push(`import { FeatureTest, Verifies } from '@frenchexdev2/requirements';`);
  for (const i of imports) body.push(`import { ${i} } from '../requirements/features/x';`);
  body.push(`@FeatureTest(${refs[0]!.feat})`);
  body.push(`export class ${className} {`);
  for (const r of refs) {
    body.push(`  @Verifies<${r.feat}>('${r.ac}')`);
    body.push(`  ${r.ac}() { return { satisfied: true }; }`);
  }
  body.push(`}`);
  body.push('');
  return body.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureRenameCodemodFeature, { timeout: 120_000 })
export class FeatureRenameCodemodTests {
  // ── Positive path ──

  @Verifies<FeatureRenameCodemodFeature>('featureRenameUpdatesAllReferences')
  async featureRenameUpdatesAllReferences() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/test/unit/cart.test.ts': testSrc([{ feat: 'CartFeature', ac: 'firstAc' }]),
    });
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs);
    expect(res.applied).toBe(true);
    const newSrc = fs.files.get('/proj/requirements/features/basket.ts')!;
    expect(newSrc).toContain('class BasketFeature');
    expect(newSrc).not.toContain('CartFeature');
    const test = fs.files.get('/proj/test/unit/cart.test.ts')!;
    expect(test).toContain('@FeatureTest(BasketFeature)');
    expect(test).toContain("@Verifies<BasketFeature>('firstAc')");
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('requirementRenameUpdatesSatisfiesArgs')
  async requirementRenameUpdatesSatisfiesArgs() {
    const fSrc =
      `import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements';\n` +
      `import { ReqOldRequirement } from '../requirements/req-old';\n` +
      `@Satisfies(ReqOldRequirement)\n` +
      `export abstract class CartFeature extends Feature {\n` +
      `  readonly id = 'CART';\n  readonly title = 'T';\n  readonly priority = Priority.Medium;\n` +
      `  abstract firstAc(): ACResult;\n}\n`;
    const fs = mkFs({
      '/proj/requirements/requirements/req-old.ts': requirementSrc('ReqOldRequirement', 'REQ-OLD'),
      '/proj/requirements/requirements/req-old.spec.json': requirementSpec('REQ-OLD'),
      '/proj/requirements/features/cart.ts': fSrc,
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    const res = await renameRequirement('REQ-OLD', 'REQ-NEW', { ...BASE_CTX, apply: true }, fs);
    expect(res.applied).toBe(true);
    const fOut = fs.files.get('/proj/requirements/features/cart.ts')!;
    expect(fOut).toContain('@Satisfies(ReqNewRequirement)');
    expect(fOut).toContain("from '../requirements/req-new'");
    expect(fs.files.has('/proj/requirements/requirements/req-new.ts')).toBe(true);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('acRenameUpdatesVerifiesCallSites')
  async acRenameUpdatesVerifiesCallSites() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART', ['oldAc']),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART', ['oldAc']),
      '/proj/test/unit/cart.test.ts': testSrc([{ feat: 'CartFeature', ac: 'oldAc' }]),
    });
    const res = await renameAc('CART', 'oldAc', 'newAc', { ...BASE_CTX, apply: true }, fs);
    expect(res.applied).toBe(true);
    const test = fs.files.get('/proj/test/unit/cart.test.ts')!;
    expect(test).toContain("@Verifies<CartFeature>('newAc')");
    expect(test).not.toContain("'oldAc'");
    const src = fs.files.get('/proj/requirements/features/cart.ts')!;
    expect(src).toContain('abstract newAc(): ACResult');
    const spec = fs.files.get('/proj/requirements/features/cart.spec.json')!;
    expect(spec).toContain('"name": "newAc"');
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameUpdatesClassFileNameOnDisk')
  async renameUpdatesClassFileNameOnDisk() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs);
    expect(res.plan.renames).toEqual(
      expect.arrayContaining([
        { from: '/proj/requirements/features/cart.ts', to: '/proj/requirements/features/basket.ts' },
        { from: '/proj/requirements/features/cart.spec.json', to: '/proj/requirements/features/basket.spec.json' },
      ]),
    );
    expect(fs.unlinks).toContain('/proj/requirements/features/cart.ts');
    expect(fs.unlinks).toContain('/proj/requirements/features/cart.spec.json');
    expect(fs.files.has('/proj/requirements/features/basket.ts')).toBe(true);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameUpdatesSpecJsonIdField')
  async renameUpdatesSpecJsonIdField() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs);
    expect(res.applied).toBe(true);
    const spec = JSON.parse(fs.files.get('/proj/requirements/features/basket.spec.json')!);
    expect(spec.id).toBe('BASKET');
    return { satisfied: true };
  }

  // ── Error / validation paths ──

  @Verifies<FeatureRenameCodemodFeature>('featureRenameRefusesConflict')
  async featureRenameRefusesConflict() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/requirements/features/basket.ts': featureSrc('BasketFeature', 'BASKET'),
      '/proj/requirements/features/basket.spec.json': featureSpec('BASKET'),
    });
    await expect(
      renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: false }, fs),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    // --force overrides
    const forced = await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: false, force: true }, fs);
    expect(forced.applied).toBe(false);
    expect(forced.plan.edits.length).toBeGreaterThan(0);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameRefusesWhenResultingCodeDoesNotTypeCheck')
  async renameRefusesWhenResultingCodeDoesNotTypeCheck() {
    // Seed a file with a syntax error; the parser will flag it post-rewrite.
    const broken = `export class CartFeature {\n  readonly id = 'CART'\n  broken syntax here (\n`;
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': broken,
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    await expect(
      renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: false }, fs),
    ).rejects.toMatchObject({ code: 'TYPECHECK' });
    for (const semanticError of ['const invalid: number = "text";', 'function typed(x: number) {} typed("text");', 'const obj = {value: 1}; obj.absent;', 'const value = 1; value();']) {
      const semanticFs = mkFs({
        '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART') + semanticError,
        '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      });
      await expect(renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, semanticFs)).rejects.toMatchObject({ code: 'TYPECHECK' });
      expect(semanticFs.writes).toEqual([]);
      expect(semanticFs.unlinks).toEqual([]);
    }
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameWritesViaFileSystemPort')
  async concurrentRenamesKeepIndependentJsonPlans() {
    const first = mkFs({ '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'), '/proj/requirements/features/cart.spec.json': featureSpec('CART') });
    const second = mkFs({ '/proj/requirements/features/other.ts': featureSrc('OtherFeature', 'OTHER'), '/proj/requirements/features/other.spec.json': featureSpec('OTHER') });
    await Promise.all([
      renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, first),
      renameFeature('OTHER', 'SECOND', { ...BASE_CTX, apply: true }, second),
    ]);
    expect(JSON.parse(first.files.get('/proj/requirements/features/basket.spec.json')!).id).toBe('BASKET');
    expect(JSON.parse(second.files.get('/proj/requirements/features/second.spec.json')!).id).toBe('SECOND');
    expect(first.files.has('/proj/requirements/features/second.spec.json')).toBe(false);
    expect(second.files.has('/proj/requirements/features/basket.spec.json')).toBe(false);
  }

  @Verifies<FeatureRenameCodemodFeature>('renameRefusesInvalidTargetIdFormat')
  async renameRefusesInvalidTargetIdFormat() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    await expect(
      renameFeature('CART', 'not-valid-id', { ...BASE_CTX, apply: false }, fs),
    ).rejects.toMatchObject({ code: 'INVALID_ID' });
    await expect(
      renameRequirement('REQ-X', 'bad', { ...BASE_CTX, apply: false }, fs),
    ).rejects.toMatchObject({ code: 'INVALID_ID' });
    await expect(
      renameAc('CART', 'oldAc', 'Bad-Name', { ...BASE_CTX, apply: false }, fs),
    ).rejects.toMatchObject({ code: 'INVALID_ID' });
    // ac rename requires owner
    await expect(
      runRename({ ...BASE_CTX, kind: 'ac', oldId: 'a', newId: 'b' }, fs),
    ).rejects.toBeInstanceOf(RenameError);
    return { satisfied: true };
  }

  // ── Integration ──

  @Verifies<FeatureRenameCodemodFeature>('renameRunsInDryRunModeByDefault')
  async renameRunsInDryRunModeByDefault() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/test/unit/cart.test.ts': testSrc([{ feat: 'CartFeature', ac: 'firstAc' }]),
    });
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX /* no apply */ }, fs);
    expect(res.applied).toBe(false);
    expect(fs.writes).toHaveLength(0);
    expect(fs.unlinks).toHaveLength(0);
    // But the plan contains edits.
    expect(res.plan.edits.length).toBeGreaterThan(0);
    expect(res.plan.renames.length).toBeGreaterThan(0);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameEmitsUnifiedDiffToStdout')
  async renameEmitsUnifiedDiffToStdout() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX }, fs);
    expect(res.plan.unifiedDiff).toMatch(/^---/m);
    expect(res.plan.unifiedDiff).toMatch(/^\+\+\+/m);
    expect(res.plan.unifiedDiff).toContain('-');
    expect(res.plan.unifiedDiff).toContain('+');
    expect(res.plan.unifiedDiff).toContain('rename ');
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameWritesViaFileSystemPort')
  async renameWritesViaFileSystemPort() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/test/unit/cart.test.ts': testSrc([{ feat: 'CartFeature', ac: 'firstAc' }]),
    });
    await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs);
    // Every mutation observed strictly through the port.
    expect(fs.writes.length).toBeGreaterThan(0);
    expect(fs.unlinks.length).toBeGreaterThan(0);
    for (const w of fs.writes) expect(typeof w.path).toBe('string');
    return { satisfied: true };
  }

  // ── End-to-end ──

  @Verifies<FeatureRenameCodemodFeature>('endToEndRenameFlowsAcrossThirtyVerifiesSites')
  async endToEndRenameFlowsAcrossThirtyVerifiesSites() {
    const acs = Array.from({ length: 30 }, (_, i) => `ac${i}`);
    const seed: Record<string, string> = {
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART', acs),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART', acs),
    };
    // Distribute 30 @Verifies sites across several test files.
    for (let i = 0; i < 30; i += 10) {
      const slice = acs.slice(i, i + 10).map(a => ({ feat: 'CartFeature', ac: a }));
      seed[`/proj/test/unit/cart-${i}.test.ts`] = testSrc(slice, `CartTests${i}`);
    }
    const fs = mkFs(seed);
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs);
    expect(res.applied).toBe(true);
    let verifies = 0;
    for (const [p, c] of fs.files) {
      if (!p.includes('/test/unit/')) continue;
      verifies += (c.match(/@Verifies<BasketFeature>/g) ?? []).length;
      expect(c).not.toContain('CartFeature');
    }
    expect(verifies).toBe(30);
    return { satisfied: true };
  }
}

// ── Extra coverage: wrappers & dry-run message ──────────────────────────────

@FeatureTest(FeatureRenameCodemodFeature, { timeout: 120_000 })
export class FeatureRenameCodemodAuxTests {
  @Verifies<FeatureRenameCodemodFeature>('renameRunsInDryRunModeByDefault')
  async dryRunMessage() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX }, fs);
    expect(res.message).toMatch(/dry-run/);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameEmitsUnifiedDiffToStdout')
  async applyMessage() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs);
    expect(res.message).toMatch(/applied/);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameRefusesMissingRemovalCapabilityBeforeWrites')
  async missingUnlinkRefusesBeforeAnyWrite() {
    // Simulate a FileSystem without unlink capability.
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    delete (fs as { unlink?: unknown }).unlink;
    await expect(renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs)).rejects.toMatchObject({ code: 'MISSING_CAPABILITY' });
    expect(fs.writes).toEqual([]);
    expect(fs.files.has('/proj/requirements/features/cart.ts')).toBe(true);
    const dryRun = await renameFeature('CART', 'BASKET', BASE_CTX, fs);
    expect(dryRun.applied).toBe(false);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('featureRenameRefusesConflict')
  async conflictByClassName() {
    // Conflict detected via a stray `class BasketFeature` occurrence in a test file.
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/test/unit/rogue.test.ts': `export class BasketFeature {}\n`,
    });
    await expect(
      renameFeature('CART', 'BASKET', { ...BASE_CTX }, fs),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('acRenameUpdatesVerifiesCallSites')
  async acRenameDryRun() {
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART', ['oldAc']),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART', ['oldAc']),
      '/proj/test/unit/cart.test.ts': testSrc([{ feat: 'CartFeature', ac: 'oldAc' }]),
    });
    const res = await renameAc('CART', 'oldAc', 'newAc', { ...BASE_CTX }, fs);
    expect(res.applied).toBe(false);
    expect(res.plan.edits.some(e => e.path.endsWith('cart.test.ts'))).toBe(true);
    expect(fs.writes).toHaveLength(0);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameWritesViaFileSystemPort')
  async walkSkipsNonTsJsonFiles() {
    // Exercise the `!full.endsWith('.ts') && !full.endsWith('.json')`
    // skip branch in `walk()`: a .md, a .png, and a .ts all live in the
    // scan dir. Only the .ts gets loaded into `files`.
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/test/unit/readme.md': '# Not loaded',
      '/proj/test/unit/logo.png': 'binary-ignored',
    });
    // Poison readFile for one .ts path to exercise the read catch branch.
    const origRead = fs.readFile;
    fs.readFile = async (p: string) => {
      if (p.endsWith('unreadable.ts')) throw new Error('EACCES');
      return origRead(p, 'utf8');
    };
    const origReaddir = fs.readdir;
    fs.readdir = async (p: string) => {
      const kids = await origReaddir(p);
      if (p.includes('/test/unit')) kids.push('unreadable.ts');
      return kids;
    };
    fs.stat = async (p: string) => {
      if (p.endsWith('unreadable.ts')) return { mtimeMs: 0, size: 0, isDirectory: () => false };
      if (p.endsWith('readme.md') || p.endsWith('logo.png'))
        return { mtimeMs: 0, size: 0, isDirectory: () => false };
      const isDir = ![...fs.files.keys()].some(k => k === p);
      return { mtimeMs: 0, size: 0, isDirectory: () => isDir };
    };
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs);
    expect(res.applied).toBe(true);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameWritesViaFileSystemPort')
  async walkTolersReaddirAndStatErrors() {
    // scanDirs that don't exist → readdir throws → swallowed.
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/test/unit/sub/nested.test.ts': testSrc([{ feat: 'CartFeature', ac: 'firstAc' }]),
    });
    // Poison stat for one path to exercise the stat catch branch.
    const origStat = fs.stat;
    fs.stat = async (p: string) => {
      if (p.endsWith('nested.test.ts.tmp')) throw new Error('boom');
      return origStat(p);
    };
    // Add a phantom entry whose stat throws but whose readdir listing still
    // contains it — achieved by making readdir return an extra .tmp name.
    const origReaddir = fs.readdir;
    fs.readdir = async (p: string) => {
      if (p.includes('/unreadable')) throw new Error('EACCES');
      const kids = await origReaddir(p);
      if (p.includes('/test/unit/sub')) kids.push('nested.test.ts.tmp');
      return kids;
    };
    const ctx = {
      ...BASE_CTX,
      scanDirs: [
        '/proj/test/unit',
        '/proj/unreadable', // readdir throws
      ],
    };
    const res = await renameFeature('CART', 'BASKET', ctx, fs);
    expect(res.plan.edits.some(e => e.path.includes('/sub/nested.test.ts'))).toBe(true);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('renameRefusesWhenResultingCodeDoesNotTypeCheck')
  async typecheckForceBypass() {
    const broken = `export class CartFeature {\n  broken (\n`;
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': broken,
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
    });
    // With --force, the typecheck guard is bypassed.
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX, force: true }, fs);
    expect(res.applied).toBe(false); // dry-run still
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('featureRenameUpdatesAllReferences')
  async syntacticImportPathRewrite() {
    // Test file imports from a path ending in the old kebab — ensures the
    // syntactic import-specifier rewrite branch fires (unresolved import
    // that `SourceFile.move` alone can't update).
    const testFile =
      `import { FeatureTest, Verifies } from '@frenchexdev2/requirements';\n` +
      `import { CartFeature } from '../requirements/features/cart';\n` +
      `@FeatureTest(CartFeature)\n` +
      `export class T {\n` +
      `  @Verifies<CartFeature>('firstAc')\n` +
      `  firstAc() { return { satisfied: true }; }\n}\n`;
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/test/unit/cart.test.ts': testFile,
    });
    await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs);
    const out = fs.files.get('/proj/test/unit/cart.test.ts')!;
    expect(out).toContain("from '../requirements/features/basket'");
    expect(out).not.toContain('/cart');
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('featureRenameUpdatesAllReferences')
  async unrelatedFileIsUntouched() {
    const unrelated =
      `export class Helper {\n  foo() { return 1; }\n}\n`;
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/test/unit/helper.ts': unrelated,
    });
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, fs);
    expect(res.applied).toBe(true);
    // helper.ts must NOT appear in edits (exercises the `before === text`
    // false branch in the edit-collection loop).
    expect(res.plan.edits.some(e => e.path.endsWith('helper.ts'))).toBe(false);
    expect(fs.files.get('/proj/test/unit/helper.ts')).toBe(unrelated);
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('acRenameUpdatesVerifiesCallSites')
  async acRenameIgnoresUnrelatedVerifies() {
    // Test file has a @Verifies<OtherFeature>('oldAc') AND a
    // @Verifies('oldAc') (no type args) — neither should be touched when
    // renaming oldAc on CartFeature. Exercises the two false branches in
    // the Verifies-walk (typeArgs.length === 0, typeArgs[0] !== ownerClass).
    const testFile =
      `import { FeatureTest, Verifies } from '@frenchexdev2/requirements';\n` +
      `import { CartFeature, OtherFeature } from '../requirements/features/x';\n` +
      `@FeatureTest(CartFeature)\n` +
      `export class T {\n` +
      `  @Verifies<CartFeature>('oldAc')\n` +
      `  a() { return { satisfied: true }; }\n` +
      `  @Verifies<OtherFeature>('oldAc')\n` +
      `  b() { return { satisfied: true }; }\n` +
      `  @Verifies('oldAc')\n` +
      `  c() { return { satisfied: true }; }\n` +
      `  @Verifies<CartFeature>('differentAc')\n` +
      `  d() { return { satisfied: true }; }\n` +
      `  @Verifies<CartFeature>(dynamicName)\n` +
      `  e() { return { satisfied: true }; }\n` +
      `}\n` +
      `declare const dynamicName: string;\n`;
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART', ['oldAc']),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART', ['oldAc']),
      '/proj/test/unit/cart.test.ts': testFile,
    });
    const res = await renameAc('CART', 'oldAc', 'newAc', { ...BASE_CTX, apply: true }, fs);
    expect(res.applied).toBe(true);
    const out = fs.files.get('/proj/test/unit/cart.test.ts')!;
    expect(out).toContain("@Verifies<CartFeature>('newAc')");
    expect(out).toContain("@Verifies<OtherFeature>('oldAc')");
    expect(out).toContain("@Verifies('oldAc')");
    return { satisfied: true };
  }

  @Verifies<FeatureRenameCodemodFeature>('featureRenameRefusesConflict')
  async conflictForceOverwritesMovedFile() {
    // --force + a pre-existing target file on disk → move must not throw.
    const fs = mkFs({
      '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
      '/proj/requirements/features/cart.spec.json': featureSpec('CART'),
      '/proj/requirements/features/basket.ts': featureSrc('BasketFeature', 'BASKET'),
      '/proj/requirements/features/basket.spec.json': featureSpec('BASKET'),
    });
    const res = await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true, force: true }, fs);
    expect(res.applied).toBe(true);
    return { satisfied: true };
  }
}

@FeatureTest(FeatureRenameCodemodFeature, { timeout: 120_000 })
class RenameInvalidSourceContracts {
  @Verifies<FeatureRenameCodemodFeature>('renameRefusesMissingSourceClassOrCriterion')
  async missingDeclarationsNeverRewriteReferencesOrSidecars() {
    const featurePath = '/proj/requirements/features/cart.ts';
    const specPath = '/proj/requirements/features/cart.spec.json';
    const scenarios: { kind: 'feature' | 'ac'; seed: Record<string, string>; code: string }[] = [
      { kind: 'feature' as const, seed: { [specPath]: featureSpec('CART') }, code: 'MISSING_SOURCE' },
      { kind: 'feature' as const, seed: { [featurePath]: 'export class Helper {}' }, code: 'MISSING_CLASS' },
      { kind: 'ac' as const, seed: { [specPath]: featureSpec('CART') }, code: 'MISSING_SOURCE' },
      { kind: 'ac' as const, seed: { [featurePath]: 'export class Helper {}' }, code: 'MISSING_CLASS' },
      { kind: 'ac' as const, seed: { [featurePath]: featureSrc('CartFeature', 'CART', []) }, code: 'MISSING_AC' },
    ];
    for (const scenario of scenarios) for (const force of [false, true]) {
      const fs = mkFs(scenario.seed);
      const initial = new Map(fs.files);
      const options: RenameOptions = scenario.kind === 'feature'
        ? { ...BASE_CTX, kind: 'feature', oldId: 'CART', newId: 'BASKET', apply: true, force }
        : { ...BASE_CTX, kind: 'ac', owner: 'CART', oldId: 'missing', newId: 'renamed', apply: true, force };
      await expect(runRename(options, fs)).rejects.toMatchObject({ code: scenario.code });
      expect(fs.writes).toEqual([]); expect(fs.unlinks).toEqual([]); expect(fs.files).toEqual(initial);
    }
  }

  @Verifies<FeatureRenameCodemodFeature>('sameIdentityRenamePreservesEveryFile')
  async sameIdentityRenamePreservesEveryFile() {
    for (const withSidecar of [false, true]) {
      const seed: Record<string, string> = { '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART') };
      if (withSidecar) seed['/proj/requirements/features/cart.spec.json'] = featureSpec('CART');
      for (const apply of [false, true]) {
        const fs = mkFs(seed), initial = new Map(fs.files);
        const result = await renameFeature('CART', 'CART', { ...BASE_CTX, apply }, fs);
        expect(result.applied).toBe(apply);
        expect(result.plan.renames).toEqual([]); expect(result.plan.edits).toEqual([]);
        expect(fs.writes).toEqual([]); expect(fs.unlinks).toEqual([]); expect(fs.files).toEqual(initial);
      }
    }
  }
}
@FeatureTest(FeatureRenameCodemodFeature, { timeout: 120_000 })
class RenameSidecarContracts {
  @Verifies<FeatureRenameCodemodFeature>('renameDiagnosticsIdentifyGlobalAndFileErrors')
  renameDiagnosticsIdentifyGlobalAndFileErrors() {
    expect(formatRenameDiagnostic({ getSourceFile: () => undefined, getMessageText: () => 'Global failure' })).toBe('<unknown>: Global failure');
    expect(formatRenameDiagnostic({ getSourceFile: () => ({ getFilePath: () => '/proj/é.ts' }), getMessageText: () => ({ getMessageText: () => 'Nested failure' }) })).toBe('/proj/é.ts: Nested failure');
  }

  @Verifies<FeatureRenameCodemodFeature>('renameRejectsContradictorySidecarsAndPreservesHistory')
  async invalidOrContradictoryJsonNeverProducesPartialWrites() {
    const invalidSpecs: unknown[] = [null, [], {}, { id: 'CART' }, { kind: 'feature' },
      { kind: 'feature', id: 'OTHER' }, { kind: 'requirement', id: 'CART' }];
    for (const content of ['{broken', ...invalidSpecs.map(spec => JSON.stringify(spec))]) {
      const fs = mkFs({ '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
        '/proj/requirements/features/cart.spec.json': content });
      const initial = new Map(fs.files);
      await expect(renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true, force: true }, fs)).rejects.toMatchObject({ code: 'SPEC_MISMATCH' });
      expect(fs.files).toEqual(initial); expect(fs.writes).toEqual([]); expect(fs.unlinks).toEqual([]);
    }
    for (const acs of [undefined, null, [null], [{}], [{ name: 1 }], [{ name: 'different' }]]) {
      const fs = mkFs({ '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART'),
        '/proj/requirements/features/cart.spec.json': JSON.stringify({ kind: 'feature', id: 'CART', acs }) });
      await expect(renameAc('CART', 'firstAc', 'renamed', { ...BASE_CTX, apply: true }, fs)).rejects.toMatchObject({ code: 'SPEC_MISMATCH' });
      expect(fs.writes).toEqual([]); expect(fs.unlinks).toEqual([]);
    }
  }

  @Verifies<FeatureRenameCodemodFeature>('renameRejectsContradictorySidecarsAndPreservesHistory')
  async nestedIdentitiesAndHistoricalNamesRemainUnchanged() {
    const spec = { ...JSON.parse(featureSpec('CART', ['firstAc', 'secondAc'])),
      history: [{ id: 'CART', name: 'firstAc' }], metadata: { id: 'CART', name: 'firstAc' } };
    const seed = { '/proj/requirements/features/cart.ts': featureSrc('CartFeature', 'CART', ['firstAc', 'secondAc']),
      '/proj/requirements/features/cart.spec.json': JSON.stringify(spec) };
    const classFs = mkFs(seed);
    await renameFeature('CART', 'BASKET', { ...BASE_CTX, apply: true }, classFs);
    expect(JSON.parse(classFs.files.get('/proj/requirements/features/basket.spec.json')!)).toEqual({ ...spec, id: 'BASKET' });
    const acFs = mkFs(seed);
    await renameAc('CART', 'firstAc', 'renamed', { ...BASE_CTX, apply: true }, acFs);
    expect(JSON.parse(acFs.files.get('/proj/requirements/features/cart.spec.json')!)).toEqual({ ...spec,
      acs: [{ name: 'renamed', expects: ['unit'] }, { name: 'secondAc', expects: ['unit'] }] });
    for (const withSidecar of [true, false]) {
      const fs = mkFs(seed);
      if (!withSidecar) fs.files.delete('/proj/requirements/features/cart.spec.json');
      const result = await renameAc('CART', 'firstAc', 'firstAc', { ...BASE_CTX, apply: true }, fs);
      expect(result.plan.edits).toEqual([]); expect(result.plan.renames).toEqual([]);
      expect(fs.writes).toEqual([]); expect(fs.unlinks).toEqual([]);
    }
  }
}
