import { expect } from 'vitest';
import { FeatureTest, Verifies } from '../../src/decorators';
import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { SmokeFeature } from '@frenchexdev2/requirements-requirements';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, '..', '..', 'bin', 'requirements-entry.mjs');

function runBin(args: string, cwd: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(`node "${BIN}" ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

function withFixture<T>(fn: (cwd: string) => T): T {
  const cwd = mkdtempSync(join(tmpdir(), 'req-smoke-'));
  try {
    return fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const PKG_ROOT = resolve(__dirname, '..', '..');

/**
 * Like `withFixture`, but rooted inside the package so Node resolves `tsx`
 * (which the bin loads through `--import`) from an ancestor `node_modules`.
 * A fixture under the OS temp dir has no such ancestor and the bin dies before
 * reaching any command.
 */
function withResolvableFixture<T>(files: Record<string, string>, fn: (cwd: string) => T): T {
  const cwd = mkdtempSync(join(PKG_ROOT, '.req-smoke-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(cwd, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf8');
    }
    return fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** A project that declares traceability in decorated classes only — no `*.spec.json` anywhere. */
const TS_ONLY_PROJECT: Record<string, string> = {
  'requirements.config.json': JSON.stringify({
    featuresDir: 'requirements/features',
    requirementsDir: 'requirements/requirements',
    bindingsDir: 'requirements/bindings',
    testDirs: ['test/unit'],
  }),
  'requirements/requirements/alpha.ts': `
import { Requirement } from '@frenchexdev2/requirements';
export abstract class AlphaRequirement extends Requirement {
  readonly id = 'REQ-ALPHA';
  readonly status = 'Approved';
}
`,
  'requirements/features/linked.ts': `
import { Feature, Priority, Satisfies } from '@frenchexdev2/requirements';
import { AlphaRequirement } from '../requirements/alpha';
@Satisfies(AlphaRequirement)
export abstract class LinkedFeature extends Feature {
  readonly id = 'LINKED';
  readonly title = 'Linked';
  readonly priority = Priority.High;
  abstract doesSomething(): unknown;
}
`,
  'requirements/features/orphan.ts': `
import { Feature, Priority } from '@frenchexdev2/requirements';
export abstract class OrphanFeature extends Feature {
  readonly id = 'ORPHAN';
  readonly title = 'Orphan';
  readonly priority = Priority.High;
  abstract doesSomethingElse(): unknown;
}
`,
};

@FeatureTest(SmokeFeature)
class RequirementsBinSmokeTests {
  @Verifies<SmokeFeature>('binPrintsHelpOnHelpFlag')
  'bin --help exits 0 and prints Usage'() {
    const r = runBin('--help', process.cwd());
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/Usage:/i);
  }

  @Verifies<SmokeFeature>('complianceHelpListsFlags')
  'compliance --help mentions --strict / --json'() {
    const r = runBin('compliance --help', process.cwd());
    expect(r.code).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/--strict/);
    expect(out).toMatch(/--json/);
  }

  @Verifies<SmokeFeature>('traceHelpListsSubcommands')
  'trace --help mentions gaps / matrix / chain'() {
    const r = runBin('trace --help', process.cwd());
    expect(r.code).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/gaps/);
    expect(out).toMatch(/matrix/);
    expect(out).toMatch(/chain/);
  }

  @Verifies<SmokeFeature>('scaffoldHelpListsSubcommands')
  'scaffold --help mentions test / e2e'() {
    const r = runBin('scaffold --help', process.cwd());
    expect(r.code).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/\btest\b/);
    expect(out).toMatch(/\be2e\b/);
  }

  @Verifies<SmokeFeature>('traceGapsOnEmptyFixtureDoesNotCrash')
  'trace gaps on empty fixture does not crash with a stack trace'() {
    return withFixture((cwd) => {
      const r = runBin('trace gaps', cwd);
      // Either exits 0 (no features, no gaps) or non-zero (config missing),
      // but must NOT emit a raw JS stack trace.
      expect(r.stderr).not.toMatch(/at Object\.<anonymous>/);
      expect(r.stderr).not.toMatch(/TypeError/);
    });
  }

  @Verifies<SmokeFeature>('orphanCommandReadsSatisfiesFromTsClassesWhenNoSpecSidecarExists')
  'requirement orphan reads @Satisfies off the classes when a project has no spec sidecars'() {
    return withResolvableFixture(TS_ONLY_PROJECT, (cwd) => {
      const r = runBin('requirement orphan --json', cwd);
      const payload = JSON.parse(r.stdout) as {
        origin: string; scanned: number; specOrphans: string[]; runtimeOrphans: string[];
      };
      // Reading only the (absent) sidecars would scan 0 Features and report 0
      // orphans — a green that proves nothing.
      expect(payload.origin).toBe('source');
      expect(payload.scanned).toBe(2);
      expect(payload.specOrphans).toEqual(['ORPHAN']);
      expect(payload.runtimeOrphans).toEqual([]);
    });
  }

  @Verifies<SmokeFeature>('complianceStrictFailsOnAnOrphanDeclaredOnlyInTypeScript')
  'compliance --strict fails on a Feature whose only declaration is an undecorated class'() {
    return withResolvableFixture(TS_ONLY_PROJECT, (cwd) => {
      const r = runBin('compliance --strict', cwd);
      expect(r.code).toBe(1);
      const out = r.stdout + r.stderr;
      expect(out).toMatch(/Quality gate: FAIL/);
      expect(out).toMatch(/1 orphan Feature\(s\)/);
      expect(out).toMatch(/ORPHAN/);
    });
  }
}

// Prevent "test file has no tests" when the decorator-driven registry runs.
void RequirementsBinSmokeTests;
