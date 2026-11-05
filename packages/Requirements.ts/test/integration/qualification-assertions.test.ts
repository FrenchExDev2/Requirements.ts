import { expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { QualificationInfrastructureFeature } from '../../packages/requirements-requirements/src/qualification-contracts.js';
import { inspectQualificationTests } from '../../packages/requirements-compliance/src/qualification-inventory.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const vitest = resolve(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');

@FeatureTest(QualificationInfrastructureFeature, { timeout: 120_000 })
class QualificationAssertionExecutionTests {
  @Verifies<QualificationInfrastructureFeature>('rejectsUnexecutedAssertions')
  async deadAssertionsCannotQualify() {
    const directory = await mkdtemp(resolve(root, 'test-results/assertions-'));
    try {
      for (const [name, body, passes] of [
        ['empty', '', false],
        ['dead', 'if (false) expect(1).toBe(1);', false],
        ['executed', 'expect(1).toBe(1);', true],
        ['property', 'fc.assert(fc.property(fc.integer(), value => value === value), {numRuns: 10});', true],
        ['unused-property', 'void fc;', false],
      ] as const) {
        const file = resolve(directory, `${name}.test.ts`);
        const adapter = resolve(root, 'test/support/qualification-fast-check.ts').replaceAll('\\', '/');
        const text = `import {expect} from 'vitest'; import * as fc from ${JSON.stringify(adapter)}; import {FeatureTest, Verifies} from '@frenchexdev2/requirements'; class ValueFeature {} @FeatureTest(ValueFeature as any) class ValueTests { @Verifies<any>('accepts') accepts(){${body}} }`;
        await writeFile(file, text, 'utf8');
        if (name === 'dead') expect(inspectQualificationTests({ file, text }, root).tests[0]!.hasAssertion).toBe(true);
        const config = resolve(directory, `${name}.config.mjs`);
        await writeFile(config, `export default ${JSON.stringify({ oxc: { decorator: { legacy: true } }, test: { globals: true, include: [file.replaceAll('\\', '/')], setupFiles: [resolve(root, 'test/support/qualification-assertions.ts').replaceAll('\\', '/')], maxWorkers: 1 } })}`, 'utf8');
        const result = await promisify(execFile)(process.execPath, [vitest, 'run', '--config', config], { cwd: root, encoding: 'utf8', timeout: 45_000, env: { ...process.env, TEST_RUN_ID: '', QUALIFICATION_FULL: '0' } }).then(
          value => ({ exitCode: 0, output: value.stdout + value.stderr }),
          (error: { code: number; stdout: string; stderr: string }) => ({ exitCode: error.code, output: error.stdout + error.stderr }),
        );
        expect(result.exitCode === 0, result.output).toBe(passes);
        if (!passes) expect(result.output).toContain('at least one executed assertion');
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
void QualificationAssertionExecutionTests;
