import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const directory = new URL('../.github/workflows/', import.meta.url);

for (const filename of await readdir(directory)) {
  if (!/\.ya?ml$/.test(filename)) continue;
  test(`${filename}: runner shell formats its script path without interpreting PowerShell braces`, async () => {
    const workflow = await readFile(new URL(filename, directory), 'utf8');
    const block = /    shell: >-\r?\n((?:      [^\r\n]+\r?\n)+)/.exec(workflow);
    assert.ok(block, 'Expected the custom folded shell template');
    const template = block[1].trim().split(/\r?\n/).map(line => line.trim()).join(' ');
    let placeholders = 0;
    const formatted = template.replace(/\{\{|\}\}|\{0\}|[{}]/g, token => {
      if (token === '{0}') {
        placeholders++;
        return 'runner-script.ps1';
      }
      assert.ok(token === '{{' || token === '}}', `Unescaped shell brace: ${token}`);
      return token[0];
    });
    assert.equal(placeholders, 1);
    assert.match(formatted, /if \(\$PSVersionTable\.PSVersion -lt \[version\]'7\.6'\) \{ throw 'PowerShell 7\.6\+ is required\.' \}/);
    assert.ok(formatted.endsWith(`. 'runner-script.ps1'"`));
  });
}

test('npm publication requires a pushed version tag and successful verification on both platforms', async () => {
  const workflow = await readFile(new URL('ci.yml', directory), 'utf8');
  assert.match(workflow, /tags: \['v\*'\]/);
  const publish = workflow.slice(workflow.indexOf('\n  publish:'));
  assert.ok(publish.startsWith('\n  publish:'), 'Expected the publication job');
  assert.match(publish, /needs: verify/);
  assert.match(publish, /if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(publish, /group: npm-publication\r?\n\s+cancel-in-progress: false/);
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest\]/);
  assert.match(workflow, /run: node --test test\/release\.test\.mjs/);
  assert.match(workflow, /run: pnpm run test:ci/);
  assert.match(publish, /run: node scripts\/release\.mjs check "\$env:GITHUB_REF_NAME"/);
  assert.match(publish, /run: node scripts\/dependencies\.mjs check/);
  assert.match(publish, /run: pnpm install --frozen-lockfile/);
  assert.match(publish, /run: pnpm run build/);
  assert.match(publish, /id-token: write/);
  assert.match(publish, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.match(publish, /DIST_TAG: \$\{\{ steps\.release\.outputs\.dist-tag \}\}/);
  assert.match(publish, /pnpm -r publish --access public --registry https:\/\/registry\.npmjs\.org\/ --tag "\$env:DIST_TAG" --no-git-checks --ignore-scripts/);
});
