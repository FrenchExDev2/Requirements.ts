#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = resolve(__dirname, '..', 'dist', 'bin', 'requirements.js');

const child = spawn(
  process.execPath,
  [srcPath, ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: process.cwd() },
);

try {
  const [code, signal] = await once(child, 'exit');
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
