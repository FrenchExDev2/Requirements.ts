// Objective: Validate package README identity, local links and TypeScript examples.
// Run from any directory: node test/docs/package-readmes.mjs [report.json].
// Requires the workspace dependencies and built public declaration files.
import { readdir, readFile, access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packagesDir = path.join(root, 'packages');
const failures = [];
const examples = new Map();
let packages = 0;
let links = 0;
let assertions = 0;

/** Record an independent documentation contract and retain every failure. */
function check(condition, message) {
  assertions++;
  if (!condition) failures.push(message);
}

for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(packagesDir, entry.name);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  } catch (error) {
    failures.push(`${entry.name}: cannot read package manifest: ${error.message}`);
    continue;
  }
  packages++;
  const filename = path.join(directory, 'README.md');
  let markdown;
  try {
    markdown = await readFile(filename, 'utf8');
  } catch (error) {
    failures.push(`${entry.name}: cannot read README: ${error.message}`);
    continue;
  }
  check(markdown.startsWith(`# ${manifest.name}\n`), `${entry.name}: incorrect package title`);
  check(!markdown.includes('\uFFFD'), `${entry.name}: invalid Unicode replacement character`);
  check(markdown.includes('## License\n'), `${entry.name}: license section missing`);
  check(markdown.includes('## Development and status\n'), `${entry.name}: development section missing`);
  check(markdown.includes(`pnpm --filter ${manifest.name} test`), `${entry.name}: package test command missing`);
  check(Boolean(manifest.scripts?.test), `${entry.name}: documented test script does not exist`);
  check(markdown.includes('../../LICENSE'), `${entry.name}: workspace license link missing`);
  check(!/^MIT\b/m.test(markdown), `${entry.name}: unsupported MIT license claim`);

  const fences = [...markdown.matchAll(/^```([^\n]*)\n/gm)];
  check(fences.length % 2 === 0, `${entry.name}: unbalanced fenced code blocks`);
  // Prose links only: code samples may contain Markdown-like string literals.
  const prose = markdown.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][\w+.-]*:|#)/i.test(target)) continue;
    links++;
    const local = decodeURIComponent(target.split('#')[0]);
    try {
      await access(path.resolve(directory, local));
      check(true, '');
    } catch {
      check(false, `${entry.name}: missing local link ${target}`);
    }
  }
  let index = 0;
  for (const match of markdown.matchAll(/^```(?:ts|typescript)\s*\n([\s\S]*?)^```\s*$/gm)) {
    index++;
    // The compiler canonicalizes Windows separators before querying the host.
    const examplePath = path.join(directory, `.readme-example-${index}.mts`).replaceAll('\\', '/');
    examples.set(examplePath, match[1]);
  }
}

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noUncheckedIndexedAccess: true,
  experimentalDecorators: true,
  skipLibCheck: true,
  noEmit: true,
  types: ['node'],
};
const host = ts.createCompilerHost(options);
const originalRead = host.readFile.bind(host);
const originalExists = host.fileExists.bind(host);
const originalSource = host.getSourceFile.bind(host);
host.fileExists = filename => examples.has(filename) || originalExists(filename);
host.readFile = filename => examples.get(filename) ?? originalRead(filename);
host.getSourceFile = (filename, languageVersion, onError, shouldCreateNewSourceFile) =>
  examples.has(filename)
    ? ts.createSourceFile(filename, examples.get(filename), languageVersion, true)
    : originalSource(filename, languageVersion, onError, shouldCreateNewSourceFile);
const program = ts.createProgram([...examples.keys()], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
check(diagnostics.length === 0, 'TypeScript README examples must compile against current public declarations');
for (const diagnostic of diagnostics) {
  const position = diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    : undefined;
  const location = diagnostic.file
    ? `${path.relative(root, diagnostic.file.fileName)}:${(position?.line ?? 0) + 1}`
    : 'TypeScript';
  failures.push(`${location} TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
}

const result = {
  status: failures.length ? 'Failed' : 'Success',
  packages,
  links,
  examples: examples.size,
  assertions,
  passed: assertions - (failures.length - diagnostics.length),
  failures,
  scope: 'Package README identities, local link targets and static TypeScript example compilation; no application tests or external link requests.',
};
if (process.argv[2]) {
  const reportPath = path.resolve(process.argv[2]);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = failures.length ? 1 : 0;
