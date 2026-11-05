/** Install development links without changing the committed production inputs. */
import { spawn } from 'node:child_process';
import { open, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const journalName = '.pnpm-profile.json';
const allowedOptions = new Set([
  '--frozen-lockfile', '--no-frozen-lockfile', '--lockfile-only',
  '--ignore-scripts', '--offline', '--prefer-offline', '--reporter=append-only',
]);

async function optionalRead(path) {
  try { return await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}

async function restore(root, snapshot) {
  await writeFile(join(root, 'pnpm-workspace.yaml'), Buffer.from(snapshot.workspace, 'base64'));
  if (snapshot.lockfile === null) await rm(join(root, 'pnpm-lock.yaml'), { force: true });
  else await writeFile(join(root, 'pnpm-lock.yaml'), Buffer.from(snapshot.lockfile, 'base64'));
}

/** Reject local release inputs and require a generated registry lockfile. */
export async function checkProduction(root) {
  const workspace = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8');
  if (/\b(?:link|file|portal):/i.test(workspace)) throw new Error('Production workspace contains local dependency transports.');
  const lockfile = await optionalRead(join(root, 'pnpm-lock.yaml'));
  if (!lockfile) throw new Error('Production pnpm-lock.yaml is missing. Publish external dependencies, run pnpm run deps:lock:prod, then commit the generated registry lockfile.');
  const text = lockfile.toString('utf8');
  // Internal workspace resolutions use link:, but explicit local specifiers and overrides do not.
  const overrides = /^overrides:\r?\n((?:[ \t]+[^\r\n]*\r?\n|\r?\n)*)/m.exec(text)?.[1] ?? '';
  if (/\b(?:file|portal):/i.test(text) || /\b(?:link|file|portal):/i.test(overrides) || /^\s+specifier:\s*['"]?(?:link|file|portal):/mi.test(text)) {
    throw new Error('Production lockfile contains local dependency transports. Regenerate it with pnpm run deps:lock:prod.');
  }
}

/** Use pnpm run's executable with separate arguments and no command shell. */
async function runPnpm(root, arguments_) {
  const executable = process.env.npm_execpath;
  if (!executable || !isAbsolute(executable)) throw new Error('Invoke this command through pnpm run deps:dev or pnpm run deps:prod.');
  const javascript = /\.[cm]?js$/i.test(executable);
  await new Promise((accept, reject) => {
    const child = spawn(javascript ? process.execPath : executable,
      javascript ? [executable, 'install', ...arguments_] : ['install', ...arguments_],
      { cwd: root, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`pnpm install failed (${signal ?? code}).`)));
  });
}

/** Install one profile exclusively and restore production bytes after development. */
export async function installProfile(root, profile, options = [], installer = runPnpm, environment = process.env) {
  root = resolve(root);
  if (!['dev', 'prod'].includes(profile)) throw new Error('Expected the dev or prod profile.');
  if (profile === 'dev' && (/^(true|1)$/i.test(environment.CI ?? '') || environment.GITHUB_ACTIONS === 'true')) {
    throw new Error('Development dependency links are forbidden in CI.');
  }
  for (const option of options) if (!allowedOptions.has(option)) throw new Error(`Unsupported install option: ${option}`);
  if (options.includes('--frozen-lockfile') && options.includes('--no-frozen-lockfile')) throw new Error('Conflicting frozen-lockfile options.');
  const arguments_ = [...options];
  if (!arguments_.some(option => ['--frozen-lockfile', '--no-frozen-lockfile', '--lockfile-only'].includes(option))) arguments_.push('--frozen-lockfile');
  const workspace = await readFile(join(root, 'pnpm-workspace.yaml'));
  if (profile === 'prod' && /\b(?:link|file|portal):/i.test(workspace.toString('utf8'))) throw new Error('Production workspace contains local dependency transports.');
  const devWorkspace = profile === 'dev' ? await readFile(join(root, 'pnpm-workspace.dev.yaml')) : null;
  const devLockfile = profile === 'dev' ? await optionalRead(join(root, 'pnpm-lock.dev.yaml')) : null;
  const lockfile = await optionalRead(join(root, 'pnpm-lock.yaml'));
  const snapshot = { pid: process.pid, profile, workspace: workspace.toString('base64'), lockfile: lockfile?.toString('base64') ?? null };
  const path = join(root, journalName);
  let handle;
  try { handle = await open(path, 'wx'); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another profile installation is active or interrupted. After stopping it, run pnpm run deps:recover.');
    throw error;
  }
  let succeeded = false;
  try {
    await handle.writeFile(`${JSON.stringify(snapshot)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    if (profile === 'dev') {
      await writeFile(join(root, 'pnpm-workspace.yaml'), devWorkspace);
      if (devLockfile) await writeFile(join(root, 'pnpm-lock.yaml'), devLockfile);
      else await rm(join(root, 'pnpm-lock.yaml'), { force: true });
    }
    await installer(root, arguments_);
    if (profile === 'dev') {
      const generated = await readFile(join(root, 'pnpm-lock.yaml'));
      await writeFile(join(root, 'pnpm-lock.dev.yaml'), generated);
    } else await checkProduction(root);
    succeeded = true;
  } finally {
    await handle.close();
    if (profile === 'dev' || !succeeded) await restore(root, snapshot);
    await rm(path);
  }
}

/** Restore inputs after an interrupted installation whose owner has exited. */
export async function recoverProfile(root) {
  const path = join(root, journalName);
  const snapshot = JSON.parse(await readFile(path, 'utf8'));
  if (!Number.isSafeInteger(snapshot.pid) || snapshot.pid <= 0 || !['dev', 'prod'].includes(snapshot.profile)) throw new Error('Invalid profile journal. Inspect it before recovery.');
  try { process.kill(snapshot.pid, 0); } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    await restore(root, snapshot);
    await rm(path);
    return;
  }
  throw new Error('The profile owner is still running. Stop the installation and its child processes before recovery.');
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const [profile, ...options] = process.argv.slice(2);
  if (profile === 'check' && !options.length) await checkProduction(root);
  else if (profile === 'recover' && !options.length) await recoverProfile(root);
  else await installProfile(root, profile, options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
