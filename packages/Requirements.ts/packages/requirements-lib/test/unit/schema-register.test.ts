import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureSchemaCommandFeature } from '@frenchexdev2/requirements-requirements';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import {
  registerSchema,
  buildSnippet,
  settingsPathFor,
} from '@frenchexdev2/requirements-spec-io/schema-register';

// ── In-memory FileSystem port ──
function createMemFs(initial: Record<string, string> = {}): FileSystem & {
  files: Map<string, string>;
  dirs: Set<string>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    async readFile(p: string, _encoding: 'utf8') {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    async writeFile(p: string, content: string) {
      files.set(p, content);
    },
    async exists(p: string) {
      return files.has(p) || dirs.has(p);
    },
    async mkdir(p: string, _opts?: { recursive?: boolean }) {
      dirs.add(p);
    },
    async readdir(_p: string) { return []; },
    async stat(_p: string) {
      return { mtimeMs: 0, size: 0, isDirectory() { return true; } };
    },
  };
}

const ROOT = '/tmp/project';
const SETTINGS = `${ROOT}/.vscode/settings.json`;

@FeatureTest(FeatureSchemaCommandFeature)
class PrintFlagTests {
  @Verifies<FeatureSchemaCommandFeature>('printFlagOnlyPrintsSnippet')
  '--print returns the snippet without touching fs'() {
    const fs = createMemFs();
    return registerSchema({ projectRoot: ROOT, fs, print: true }).then((r) => {
      expect(r.mode).toBe('printed');
      expect(r.settingsPath).toBe(SETTINGS);
      expect(r.snippet).toBe(buildSnippet());
      expect(fs.files.size).toBe(0);
      expect(fs.dirs.size).toBe(0);
      // Snippet references both schema URLs
      expect(r.snippet).toContain('feature-spec.schema.json');
      expect(r.snippet).toContain('requirement-spec.schema.json');
    });
  }
}
void PrintFlagTests;

@FeatureTest(FeatureSchemaCommandFeature)
class CreateTests {
  @Verifies<FeatureSchemaCommandFeature>('registerCommandWritesVscodeSettings')
  'creates .vscode/settings.json when absent'() {
    const fs = createMemFs();
    return registerSchema({ projectRoot: ROOT, fs }).then((r) => {
      expect(r.mode).toBe('created');
      expect(r.settingsPath).toBe(SETTINGS);
      expect(fs.dirs.has(`${ROOT}/.vscode`)).toBe(true);
      const written = fs.files.get(SETTINGS);
      expect(written).toBeDefined();
      const parsed = JSON.parse(written!) as { 'json.schemas': unknown[] };
      expect(Array.isArray(parsed['json.schemas'])).toBe(true);
      expect(parsed['json.schemas'].length).toBe(2);
    });
  }

  @Verifies<FeatureSchemaCommandFeature>('registerCommandWritesVscodeSettings')
  'handles trailing slash in projectRoot'() {
    expect(settingsPathFor('/proj/')).toBe('/proj/.vscode/settings.json');
    expect(settingsPathFor('/proj\\')).toBe('/proj/.vscode/settings.json');
    expect(settingsPathFor('/proj')).toBe('/proj/.vscode/settings.json');
  }
}
void CreateTests;

@FeatureTest(FeatureSchemaCommandFeature)
class MergeTests {
  @Verifies<FeatureSchemaCommandFeature>('registerCommandMergesIntoExistingSettings')
  'merges into existing settings preserving unrelated keys'() {
    const existing = JSON.stringify({
      'editor.tabSize': 2,
      'json.schemas': [
        { fileMatch: ['tsconfig.json'], url: 'https://json.schemastore.org/tsconfig' },
      ],
    }, null, 2);
    const fs = createMemFs({ [SETTINGS]: existing });
    return registerSchema({ projectRoot: ROOT, fs }).then((r) => {
      expect(r.mode).toBe('merged');
      const parsed = JSON.parse(fs.files.get(SETTINGS)!) as Record<string, unknown>;
      expect(parsed['editor.tabSize']).toBe(2);
      const schemas = parsed['json.schemas'] as { fileMatch: string[]; url: string }[];
      expect(schemas.length).toBe(3);
      expect(schemas.find((s) => s.fileMatch[0] === 'tsconfig.json')).toBeDefined();
      expect(schemas.find((s) => s.fileMatch[0]!.includes('features/'))).toBeDefined();
      expect(schemas.find((s) => s.fileMatch[0]!.includes('requirements/requirements/'))).toBeDefined();
    });
  }

  @Verifies<FeatureSchemaCommandFeature>('registerCommandMergesIntoExistingSettings')
  'idempotent merge when our entries already present'() {
    const prior = JSON.parse(buildSnippet()) as Record<string, unknown>;
    const existing = JSON.stringify(prior, null, 2) + '\n';
    const fs = createMemFs({ [SETTINGS]: existing });
    return registerSchema({ projectRoot: ROOT, fs }).then((r) => {
      expect(r.mode).toBe('merged');
      const parsed = JSON.parse(fs.files.get(SETTINGS)!) as Record<string, unknown>;
      const schemas = parsed['json.schemas'] as unknown[];
      expect(schemas.length).toBe(2);
    });
  }

  @Verifies<FeatureSchemaCommandFeature>('registerCommandMergesIntoExistingSettings')
  'handles settings with no json.schemas key'() {
    const fs = createMemFs({ [SETTINGS]: JSON.stringify({ 'editor.formatOnSave': true }, null, 2) });
    return registerSchema({ projectRoot: ROOT, fs }).then((r) => {
      expect(r.mode).toBe('merged');
      const parsed = JSON.parse(fs.files.get(SETTINGS)!) as Record<string, unknown>;
      expect(parsed['editor.formatOnSave']).toBe(true);
      expect((parsed['json.schemas'] as unknown[]).length).toBe(2);
    });
  }
}
void MergeTests;

@FeatureTest(FeatureSchemaCommandFeature)
class ConflictTests {
  @Verifies<FeatureSchemaCommandFeature>('registerCommandRefusesConflictWithoutForce')
  'refuses conflict (same fileMatch, different url) without --force'() {
    const existing = JSON.stringify({
      'json.schemas': [
        {
          fileMatch: ['**/requirements/features/*.spec.json'],
          url: 'https://evil.example.com/bad.schema.json',
        },
      ],
    });
    const fs = createMemFs({ [SETTINGS]: existing });
    return registerSchema({ projectRoot: ROOT, fs }).then((r) => {
      expect(r.mode).toBe('conflict');
      expect(r.conflictingEntry).toBeDefined();
      expect(fs.files.get(SETTINGS)).toBe(existing); // unchanged
    });
  }

  @Verifies<FeatureSchemaCommandFeature>('registerCommandRefusesConflictWithoutForce')
  'overwrites conflicting entry with --force'() {
    const existing = JSON.stringify({
      'json.schemas': [
        {
          fileMatch: ['**/requirements/features/*.spec.json'],
          url: 'https://evil.example.com/bad.schema.json',
        },
      ],
    });
    const fs = createMemFs({ [SETTINGS]: existing });
    return registerSchema({ projectRoot: ROOT, fs, force: true }).then((r) => {
      expect(r.mode).toBe('merged');
      const parsed = JSON.parse(fs.files.get(SETTINGS)!) as Record<string, unknown>;
      const schemas = parsed['json.schemas'] as { url: string }[];
      expect(schemas.some((s) => s.url === 'https://evil.example.com/bad.schema.json')).toBe(false);
      expect(schemas.length).toBe(2);
    });
  }

  @Verifies<FeatureSchemaCommandFeature>('registerCommandRefusesConflictWithoutForce')
  'refuses malformed JSON settings without --force, overrides with --force'() {
    const fs = createMemFs({ [SETTINGS]: '{not valid json' });
    return Promise.all([
      registerSchema({ projectRoot: ROOT, fs }).then((r) => {
        expect(r.mode).toBe('conflict');
        expect(r.conflictingEntry).toBeDefined();
      }),
      (async () => {
        const fs2 = createMemFs({ [SETTINGS]: '{not valid json' });
        const r = await registerSchema({ projectRoot: ROOT, fs: fs2, force: true });
        expect(r.mode).toBe('merged');
        const parsed = JSON.parse(fs2.files.get(SETTINGS)!) as Record<string, unknown>;
        expect((parsed['json.schemas'] as unknown[]).length).toBe(2);
      })(),
    ]);
  }
}
void ConflictTests;
