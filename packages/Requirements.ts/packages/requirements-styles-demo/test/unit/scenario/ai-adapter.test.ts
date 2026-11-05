/**
 * ai-adapter.ts — unit tests.
 *
 * Coverage strategy:
 *   - `StubAiAdapter` exercised deterministically, no network.
 *   - `ClaudeAiAdapter` exercised through a scripted `Fetcher` fake — the real
 *     network is never touched. Verifies prompt-caching shape, retries on 5xx/
 *     429, API-key resolution from the env fallback, and telemetry on
 *     cache hit / miss.
 *
 * 11/11 ACs of ScenarioAiAdapterFeature.
 */

import { readFileSync } from 'node:fs';
import { expect, vi } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioAiAdapterFeature } from '../../../requirements/features/scenario/scenario-ai-adapter';
import {
  ClaudeAiAdapter,
  DEFAULT_CLAUDE_MODEL,
  StubAiAdapter,
  selectAdapter,
  type AcContext,
  type AiAdapter,
} from '../../../src/ai-adapter';
import type { FetchInit, FetchResponse, Fetcher, Logger } from '@frenchexdev2/requirements-core/ports';

// ── Fakes ──────────────────────────────────────────────────────────────────

interface CapturedCall {
  readonly url: string;
  readonly init?: FetchInit;
  readonly body?: unknown;
}

interface ScriptedFetcher {
  readonly fetcher: Fetcher;
  readonly calls: readonly CapturedCall[];
  push(response: FakeResponse): void;
}

interface FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly jsonBody?: unknown;
  readonly textBody?: string;
}

function scriptedFetcher(): ScriptedFetcher {
  const calls: CapturedCall[] = [];
  const queue: FakeResponse[] = [];
  const fetcher: Fetcher = async (url: string, init?: FetchInit): Promise<FetchResponse> => {
    let body: unknown = undefined;
    if (init?.body) {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    calls.push({ url, init, body });
    const r = queue.shift();
    if (!r) {
      throw new Error('scriptedFetcher: no response queued');
    }
    return {
      ok: r.ok,
      status: r.status,
      async text(): Promise<string> { return r.textBody ?? JSON.stringify(r.jsonBody ?? {}); },
      async json(): Promise<unknown> { return r.jsonBody ?? {}; },
    };
  };
  return {
    fetcher,
    calls,
    push(r: FakeResponse): void { queue.push(r); },
  };
}

function captureLogger(): { readonly logger: Logger; readonly lines: string[] } {
  const lines: string[] = [];
  const logger: Logger = {
    info: (m: string) => { lines.push(`info: ${m}`); },
    warn: (m: string) => { lines.push(`warn: ${m}`); },
    error: (m: string) => { lines.push(`error: ${m}`); },
    debug: (m: string) => { lines.push(`debug: ${m}`); },
  };
  return { logger, lines };
}

const sampleContext: AcContext = {
  featureId: 'FEAT-A',
  acName: 'someAc',
  expectedLevels: ['Unit'],
  featureCode: 'class A {}',
  existingTestCode: 'expect(true).toBe(true)',
};

const aiAdapterSource = readFileSync(
  new URL('../../../src/ai-adapter.ts', import.meta.url),
  'utf8',
);

function noopSleep(_ms: number): Promise<void> { return Promise.resolve(); }

// ── Tests ──────────────────────────────────────────────────────────────────

@FeatureTest(ScenarioAiAdapterFeature)
class ScenarioAiAdapterTests {
  @Verifies<ScenarioAiAdapterFeature>('claudeAdapterEmitsTelemetryOnCacheHitMiss')
  rejectsInvalidRetryBudgets() {
    for (const maxRetries of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new ClaudeAiAdapter({ apiKey: 'fixture', fetcher: scriptedFetcher().fetcher, maxRetries }))
        .toThrow(/non-negative integer/);
    }
  }

  @Verifies<ScenarioAiAdapterFeature>('claudeAdapterEmitsTelemetryOnCacheHitMiss')
  async retriesTransientResponsesUsingTheDefaultTimer() {
    vi.useFakeTimers();
    try {
      const fetcher = scriptedFetcher();
      fetcher.push({ ok: false, status: 503 });
      fetcher.push({ ok: true, status: 200, jsonBody: { content: [{ type: 'text', text: 'return 42;' }] } });
      const adapter = new ClaudeAiAdapter({ apiKey: 'fixture', fetcher: fetcher.fetcher, maxRetries: 1 });
      const pending = adapter.implementAc('Implement the AC.', sampleContext);
      await vi.runAllTimersAsync();
      expect(await pending).toMatchObject({ ok: true, generatedCode: 'return 42;' });
      expect(fetcher.calls).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  }
  // ── Port (ACs 1–3) ───────────────────────────────────────────────────────

  @Verifies<ScenarioAiAdapterFeature>('aiAdapterPortIsDefinedInPortsModule')
  'AiAdapter port + AcContext + AcImplementationResult are exported from ai-adapter.ts'() {
    // Structural: both Stub and Claude implement the port; the type-level AiAdapter
    // is surfaced through the two classes' `kind` discriminants + implementAc method.
    const stub: AiAdapter = new StubAiAdapter();
    expect(stub.kind).toBe('stub');
    expect(typeof stub.implementAc).toBe('function');
    // The source file contains the port + context + result type declarations.
    expect(aiAdapterSource).toMatch(/export interface AiAdapter\b/);
    expect(aiAdapterSource).toMatch(/export interface AcContext\b/);
    expect(aiAdapterSource).toMatch(/export interface AcImplementationResult\b/);
  }

  @Verifies<ScenarioAiAdapterFeature>('aiAdapterPortExposesImplementAcMethod')
  async 'implementAc is async and takes (prompt, context) returning AcImplementationResult'() {
    const stub = new StubAiAdapter();
    const result = await stub.implementAc('do the thing', sampleContext);
    expect(result).toMatchObject({ ok: true });
    expect(typeof result.generatedCode).toBe('string');
  }

  @Verifies<ScenarioAiAdapterFeature>('aiAdapterPortReturnsStructuredSourceResult')
  async 'result carries ok + generatedCode + tokensUsed — structured, never a raw string'() {
    const stub = new StubAiAdapter();
    const r = await stub.implementAc('', sampleContext);
    expect(r.ok).toBe(true);
    expect(r.generatedCode).toContain('throw new Error');
    expect(r.tokensUsed).toBe(0);
    expect(typeof r).toBe('object');
  }

  // ── Stub (ACs 4–6) ───────────────────────────────────────────────────────

  @Verifies<ScenarioAiAdapterFeature>('stubAdapterReturnsDeterministicThrowStub')
  async 'stub returns a deterministic `throw new Error(...)` body keyed by featureId/acName'() {
    const stub = new StubAiAdapter();
    const a = await stub.implementAc('p1', sampleContext);
    const b = await stub.implementAc('p2', sampleContext);
    expect(a.generatedCode).toBe(b.generatedCode); // deterministic, prompt-independent
    expect(a.generatedCode).toBe(
      `throw new Error('Not implemented: FEAT-A/someAc');`,
    );
    const c = await stub.implementAc('', { ...sampleContext, featureId: 'X', acName: 'y' });
    expect(c.generatedCode).toBe(`throw new Error('Not implemented: X/y');`);
  }

  @Verifies<ScenarioAiAdapterFeature>('stubAdapterPerformsNoNetworkIo')
  async 'stub never invokes any fetcher — constructing one with NO fetcher succeeds'() {
    // StubAiAdapter accepts no deps → proof it cannot do I/O.
    const stub = new StubAiAdapter();
    expect(stub.kind).toBe('stub');
    // Source must not reference `fetch(` inside the StubAiAdapter body.
    const stubClass = aiAdapterSource.slice(
      aiAdapterSource.indexOf('export class StubAiAdapter'),
      aiAdapterSource.indexOf('export function selectAdapter'),
    );
    expect(stubClass).not.toMatch(/fetch\(/);
    expect(stubClass).not.toMatch(/\bFetcher\b/);
    // Smoke: running it still yields ok.
    const r = await stub.implementAc('', sampleContext);
    expect(r.ok).toBe(true);
  }

  @Verifies<ScenarioAiAdapterFeature>('stubAdapterIsSelectedWhenAiFlagAbsent')
  'selectAdapter({ ai: false }) returns a StubAiAdapter'() {
    const s = selectAdapter({ ai: false });
    expect(s.kind).toBe('stub');
    // With ai: true but no claude adapter → explicit error.
    expect(() => selectAdapter({ ai: true })).toThrow(/no Claude adapter/);
    // With ai: true and a claude → returns it unchanged.
    const fake: AiAdapter = { kind: 'claude', async implementAc() { return { ok: true }; } };
    expect(selectAdapter({ ai: true, claude: fake })).toBe(fake);
  }

  // ── Claude (ACs 7–11) ────────────────────────────────────────────────────

  @Verifies<ScenarioAiAdapterFeature>('claudeAdapterIsolatesAnthropicImport')
  'ai-adapter.ts does not import @anthropic-ai/sdk or anthropic — Fetcher only'() {
    expect(aiAdapterSource).not.toMatch(/@anthropic-ai\/sdk/);
    expect(aiAdapterSource).not.toMatch(/from ['"]anthropic['"]/);
    // Must go through Fetcher port.
    expect(aiAdapterSource).toMatch(/from '@frenchexdev2\/requirements-core\/ports'/);
    expect(aiAdapterSource).toMatch(/\bFetcher\b/);
  }

  @Verifies<ScenarioAiAdapterFeature>('claudeAdapterEnablesPromptCachingByDefault')
  async 'Claude adapter sends system as an array of blocks with cache_control:ephemeral on the feature preamble'() {
    const f = scriptedFetcher();
    f.push({
      ok: true,
      status: 200,
      jsonBody: {
        content: [{ type: 'text', text: 'return 42;' }],
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100 },
      },
    });
    const adapter = new ClaudeAiAdapter({
      apiKey: 'sk-test',
      fetcher: f.fetcher,
      sleep: noopSleep,
    });
    const r = await adapter.implementAc('instr', sampleContext);
    expect(r.ok).toBe(true);
    expect(r.generatedCode).toBe('return 42;');

    // Request shape — system is an array with cache_control on the last block.
    expect(f.calls.length).toBe(1);
    const body = f.calls[0]!.body as {
      model: string;
      system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe(DEFAULT_CLAUDE_MODEL);
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system.length).toBe(2);
    expect(body.system[0]!.cache_control).toBeUndefined();
    expect(body.system[1]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(body.system[1]!.text).toContain('FEAT-A');
    expect(body.system[1]!.text).toContain('class A {}');
    // User message carries the per-AC instruction, NOT cached.
    expect(body.messages[0]!.role).toBe('user');
    expect(body.messages[0]!.content).toContain('someAc');
    expect(body.messages[0]!.content).toContain('instr');
    // Beta header + auth headers present.
    expect(f.calls[0]!.init?.headers?.['anthropic-beta']).toMatch(/prompt-caching/);
    expect(f.calls[0]!.init?.headers?.['x-api-key']).toBe('sk-test');
    expect(f.calls[0]!.init?.headers?.['anthropic-version']).toBeDefined();
  }

  @Verifies<ScenarioAiAdapterFeature>('claudeAdapterRespectsApiKeyFromEnv')
  async 'apiKey resolves from envApiKey fallback; missing key throws'() {
    const f = scriptedFetcher();
    f.push({ ok: true, status: 200, jsonBody: { content: [{ type: 'text', text: 'x' }] } });
    const adapter = new ClaudeAiAdapter({
      apiKey: '',
      envApiKey: 'sk-from-env',
      fetcher: f.fetcher,
      sleep: noopSleep,
    });
    await adapter.implementAc('p', sampleContext);
    expect(f.calls[0]!.init?.headers?.['x-api-key']).toBe('sk-from-env');

    // Totally missing key → constructor throws.
    expect(() => new ClaudeAiAdapter({ apiKey: '', fetcher: f.fetcher })).toThrow(/apiKey is required/);

    // A model override flows through.
    const f2 = scriptedFetcher();
    f2.push({ ok: true, status: 200, jsonBody: { content: [{ type: 'text', text: 'y' }] } });
    const adapter2 = new ClaudeAiAdapter({
      apiKey: 'k',
      model: 'claude-opus-override',
      fetcher: f2.fetcher,
      sleep: noopSleep,
    });
    await adapter2.implementAc('p', sampleContext);
    expect((f2.calls[0]!.body as { model: string }).model).toBe('claude-opus-override');
  }

  @Verifies<ScenarioAiAdapterFeature>('claudeAdapterRetriesOnTransientErrors')
  async '5xx and 429 trigger exponential backoff up to maxRetries; 4xx (non-429) fails fast'() {
    // Scenario 1: two 503s then a 200 — succeeds on third attempt.
    const f = scriptedFetcher();
    f.push({ ok: false, status: 503, textBody: 'overloaded' });
    f.push({ ok: false, status: 429, textBody: 'rate-limited' });
    f.push({ ok: true, status: 200, jsonBody: { content: [{ type: 'text', text: 'ok' }] } });
    const delays: number[] = [];
    const adapter = new ClaudeAiAdapter({
      apiKey: 'k',
      fetcher: f.fetcher,
      maxRetries: 2,
      baseBackoffMs: 10,
      sleep: async (ms: number) => { delays.push(ms); },
    });
    const r = await adapter.implementAc('p', sampleContext);
    expect(r.ok).toBe(true);
    expect(f.calls.length).toBe(3);
    expect(delays).toEqual([10, 20]); // exponential: 10 * 2^0, 10 * 2^1

    // Scenario 2: persistent 500 → gives up after maxRetries + 1 attempts.
    const f2 = scriptedFetcher();
    f2.push({ ok: false, status: 500, textBody: 'boom' });
    f2.push({ ok: false, status: 500, textBody: 'boom' });
    const adapter2 = new ClaudeAiAdapter({
      apiKey: 'k',
      fetcher: f2.fetcher,
      maxRetries: 1,
      baseBackoffMs: 5,
      sleep: noopSleep,
    });
    const r2 = await adapter2.implementAc('p', sampleContext);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toMatch(/500/);
    expect(f2.calls.length).toBe(2);

    // Scenario 3: 401 unauth → fails fast, no retry.
    const f3 = scriptedFetcher();
    f3.push({ ok: false, status: 401, textBody: 'unauthorized' });
    const adapter3 = new ClaudeAiAdapter({
      apiKey: 'k',
      fetcher: f3.fetcher,
      maxRetries: 3,
      sleep: noopSleep,
    });
    const r3 = await adapter3.implementAc('p', sampleContext);
    expect(r3.ok).toBe(false);
    expect(r3.reason).toMatch(/401/);
    expect(f3.calls.length).toBe(1);
  }

  @Verifies<ScenarioAiAdapterFeature>('claudeAdapterEmitsTelemetryOnCacheHitMiss')
  async 'logger debug emits cache HIT/MISS; empty response + fenced code + safeText are handled'() {
    // Cache MISS — only cache_creation_input_tokens.
    const f1 = scriptedFetcher();
    f1.push({
      ok: true, status: 200,
      jsonBody: {
        content: [{ type: 'text', text: 'return 1;' }, { type: 'tool_use', text: 'ignored' }],
        usage: { input_tokens: 50, output_tokens: 5, cache_creation_input_tokens: 200 },
      },
    });
    const l1 = captureLogger();
    const a1 = new ClaudeAiAdapter({ apiKey: 'k', fetcher: f1.fetcher, logger: l1.logger, sleep: noopSleep });
    const r1 = await a1.implementAc('p', sampleContext);
    expect(r1.ok).toBe(true);
    expect(r1.cacheHit).toBe(false);
    expect(r1.tokensUsed).toBe(50 + 5 + 0 + 200);
    expect(l1.lines.some(l => l.includes('cache MISS'))).toBe(true);

    // Cache HIT — cache_read_input_tokens > 0 and fenced code returned.
    const f2 = scriptedFetcher();
    f2.push({
      ok: true, status: 200,
      jsonBody: {
        content: [{ type: 'text', text: '```ts\nreturn 2;\n```' }],
        usage: { input_tokens: 3, output_tokens: 2, cache_read_input_tokens: 200 },
      },
    });
    const l2 = captureLogger();
    const a2 = new ClaudeAiAdapter({ apiKey: 'k', fetcher: f2.fetcher, logger: l2.logger, sleep: noopSleep });
    const r2 = await a2.implementAc('p', sampleContext);
    expect(r2.ok).toBe(true);
    expect(r2.cacheHit).toBe(true);
    expect(r2.generatedCode).toBe('return 2;'); // fence stripped
    expect(l2.lines.some(l => l.includes('cache HIT'))).toBe(true);

    // Empty response — ok: false with tokensUsed surfaced.
    const f3 = scriptedFetcher();
    f3.push({ ok: true, status: 200, jsonBody: { content: [], usage: {} } });
    const a3 = new ClaudeAiAdapter({ apiKey: 'k', fetcher: f3.fetcher, sleep: noopSleep });
    const r3 = await a3.implementAc('p', sampleContext);
    expect(r3.ok).toBe(false);
    expect(r3.reason).toBe('empty response');

    // No `content` field at all → `?? []` fallback branch.
    const f3b = scriptedFetcher();
    f3b.push({ ok: true, status: 200, jsonBody: {} });
    const a3b = new ClaudeAiAdapter({ apiKey: 'k', fetcher: f3b.fetcher, sleep: noopSleep });
    const r3b = await a3b.implementAc('p', sampleContext);
    expect(r3b.ok).toBe(false);

    // Context WITHOUT existingTestCode — the user message omits the "Existing test stub" block.
    // Also: NO `sleep` dep and NO retry (single success) → exercises the `sleep ?? defaultSleep`
    // default-branch without ever invoking the real setTimeout.
    const f4 = scriptedFetcher();
    f4.push({ ok: true, status: 200, jsonBody: { content: [{ type: 'text', text: 'z' }] } });
    const a4 = new ClaudeAiAdapter({ apiKey: 'k', fetcher: f4.fetcher });
    const ctxNoTest: AcContext = { featureId: 'F', acName: 'a', expectedLevels: [], featureCode: 'c' };
    await a4.implementAc('p', ctxNoTest);
    const userContent = (f4.calls[0]!.body as { messages: Array<{ content: string }> }).messages[0]!.content;
    expect(userContent).not.toContain('Existing test stub');
    expect(userContent).toContain('(none)'); // empty expectedLevels path

    // safeText branch: the `text()` method throws → still yields a reason string.
    const throwingFetcher: Fetcher = async (): Promise<FetchResponse> => ({
      ok: false,
      status: 502,
      async text(): Promise<string> { throw new Error('body read failed'); },
      async json(): Promise<unknown> { return {}; },
    });
    const a5 = new ClaudeAiAdapter({
      apiKey: 'k',
      fetcher: throwingFetcher,
      maxRetries: 0,
      sleep: noopSleep,
    });
    const r5 = await a5.implementAc('p', sampleContext);
    expect(r5.ok).toBe(false);
    expect(r5.reason).toMatch(/502/);
  }
}

// Silence unused-class lint (vitest picks it up via @FeatureTest side effect).
void ScenarioAiAdapterTests;
