/**
 * AiAdapter port + two built-in implementations:
 *
 *   - StubAiAdapter    — deterministic throw-stub body; zero network I/O.
 *   - ClaudeAiAdapter  — Anthropic Messages API with prompt caching enabled
 *                        per the `claude-api` skill (ephemeral cache on the
 *                        static preamble: system prompt + feature code).
 *
 * The `AiAdapter` port is the sole seam allowed to perform network I/O in the
 * ScenariiPlayer. Per REQ-AI-AS-IMPLEMENTER-ADAPTER:
 *   - No direct network-call primitive outside this file.
 *   - No official vendor-SDK import outside this file.
 *   - ClaudeAiAdapter goes through the injected `Fetcher` port so unit tests
 *     never touch the real network.
 *
 * Satisfies: ScenarioAiAdapterFeature.
 * Feature contract: `requirements/features/scenario/scenario-ai-adapter.ts`.
 */

import type { Fetcher, FetchResponse, Logger } from '@frenchexdev2/requirements-core/ports';

// ══════════════════════════════════════════════════════════════════════════════
// Port
// ══════════════════════════════════════════════════════════════════════════════

/** Context passed to an adapter for every AC implementation request. */
export interface AcContext {
  readonly featureId: string;
  readonly acName: string;
  readonly expectedLevels: readonly string[];
  /** Generated TypeScript source of the Feature class (static — cacheable). */
  readonly featureCode: string;
  /** Scaffolded test stub (varies per-AC — NOT part of the cached preamble). */
  readonly existingTestCode?: string;
}

/** Structured result — never throws; `ok: false` carries a reason. */
export interface AcImplementationResult {
  readonly ok: boolean;
  readonly generatedCode?: string;
  readonly reason?: string;
  readonly tokensUsed?: number;
  /** True when the Claude response reports a cache hit on the preamble. */
  readonly cacheHit?: boolean;
}

/** AiAdapter port — the only seam allowed to perform network I/O. */
export interface AiAdapter {
  readonly kind: 'stub' | 'claude' | string;
  implementAc(prompt: string, context: AcContext): Promise<AcImplementationResult>;
}

// ══════════════════════════════════════════════════════════════════════════════
// StubAiAdapter — deterministic, no network
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a deterministic throw-stub AC body. No network, no non-determinism,
 * no dependencies. The default when `--ai` is absent.
 */
export class StubAiAdapter implements AiAdapter {
  readonly kind = 'stub' as const;

  async implementAc(_prompt: string, context: AcContext): Promise<AcImplementationResult> {
    const body = `throw new Error('Not implemented: ${context.featureId}/${context.acName}');`;
    return {
      ok: true,
      generatedCode: body,
      tokensUsed: 0,
    };
  }
}

/** Factory that returns a stub when the `--ai` flag is absent. */
export function selectAdapter(opts: {
  readonly ai: boolean;
  readonly claude?: AiAdapter;
}): AiAdapter {
  if (!opts.ai) return new StubAiAdapter();
  if (!opts.claude) {
    throw new Error('selectAdapter: --ai requested but no Claude adapter was provided');
  }
  return opts.claude;
}

// ══════════════════════════════════════════════════════════════════════════════
// ClaudeAiAdapter — Anthropic Messages API with prompt caching
// ══════════════════════════════════════════════════════════════════════════════

export interface ClaudeAdapterDeps {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetcher: Fetcher;
  readonly logger?: Logger;
  /** Optional per-run cache-key prefix (distinguishes replays). */
  readonly cachePrefix?: string;
  /** Max transient-error retries. Defaults to 2 (3 attempts total). */
  readonly maxRetries?: number;
  /** Base backoff in ms — actual delay = baseBackoffMs × 2^attempt. */
  readonly baseBackoffMs?: number;
  /** Optional sleep port for deterministic retry-backoff tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Resolves the API key from env when `apiKey` is empty. */
  readonly envApiKey?: string;
}

/** Default Anthropic model — kept cheap-but-capable for demo runs. */
export const DEFAULT_CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';
const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const SYSTEM_PROMPT =
  'You are an expert TypeScript engineer. Given a Feature class and one of its ' +
  'abstract AC methods, emit ONLY the method body (no surrounding function signature, ' +
  'no markdown fence, no commentary). The body must compile against the Feature contract.';

/**
 * Claude Messages-API adapter with ephemeral prompt caching on the static
 * preamble (system prompt + feature code). Only the per-AC user prompt varies
 * between calls, so successive ACs of the same Feature hit the cache.
 */
export class ClaudeAiAdapter implements AiAdapter {
  readonly kind = 'claude' as const;
  private readonly deps: ClaudeAdapterDeps;

  constructor(deps: ClaudeAdapterDeps) {
    if (deps.maxRetries !== undefined && (!Number.isInteger(deps.maxRetries) || deps.maxRetries < 0)) {
      throw new RangeError('ClaudeAiAdapter: maxRetries must be a non-negative integer');
    }
    const resolvedKey = deps.apiKey || deps.envApiKey || '';
    if (!resolvedKey) {
      throw new Error(
        'ClaudeAiAdapter: apiKey is required (pass --ai with ANTHROPIC_API_KEY set)',
      );
    }
    this.deps = { ...deps, apiKey: resolvedKey };
  }

  async implementAc(prompt: string, context: AcContext): Promise<AcImplementationResult> {
    const body = this.buildRequestBody(prompt, context);
    const maxRetries = this.deps.maxRetries ?? 2;
    const baseBackoff = this.deps.baseBackoffMs ?? 100;
    const sleep = this.deps.sleep ?? defaultSleep;

    for (let attempt = 0; ; attempt++) {
      const res = await this.deps.fetcher(CLAUDE_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.deps.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          // Opt-in for prompt-caching beta (no-op once GA, harmless).
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return parseClaudeResponse(res, this.deps.logger);
      }
      if (!isTransient(res.status) || attempt === maxRetries) {
        const text = await safeText(res);
        this.deps.logger?.error?.(
          `ClaudeAiAdapter: giving up after ${attempt + 1} attempt(s): ${res.status} ${text}`,
        );
        return { ok: false, reason: `HTTP ${res.status}: ${text}` };
      }
      const lastErr = `HTTP ${res.status}`;
      this.deps.logger?.warn?.(
        `ClaudeAiAdapter: transient ${lastErr}, retry ${attempt + 1}/${maxRetries}`,
      );
      await sleep(baseBackoff * Math.pow(2, attempt));
    }
  }

  /**
   * Build the Messages-API request body. The **static preamble** (system
   * prompt + feature code) carries `cache_control: { type: 'ephemeral' }` so
   * the Anthropic endpoint reuses it across ACs of the same Feature.
   * Per the `claude-api` skill:
   *   - system is an array of blocks, the last of which bears cache_control;
   *   - the user message is NOT cached (it varies per AC).
   */
  private buildRequestBody(prompt: string, context: AcContext): ClaudeRequestBody {
    const featurePreamble =
      `# Feature source (stable across all ACs of ${context.featureId})\n` +
      '```ts\n' + context.featureCode + '\n```';
    const userPrompt =
      `AC: ${context.acName}\n` +
      `Expected test levels: ${context.expectedLevels.join(', ') || '(none)'}\n` +
      (context.existingTestCode
        ? `Existing test stub:\n\`\`\`ts\n${context.existingTestCode}\n\`\`\`\n`
        : '') +
      `Instruction: ${prompt}`;
    return {
      model: this.deps.model ?? DEFAULT_CLAUDE_MODEL,
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        {
          type: 'text',
          text: featurePreamble,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: userPrompt },
      ],
    };
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

interface ClaudeRequestBody {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: readonly {
    readonly type: 'text';
    readonly text: string;
    readonly cache_control?: { readonly type: 'ephemeral' };
  }[];
  readonly messages: readonly {
    readonly role: 'user' | 'assistant';
    readonly content: string;
  }[];
}

interface ClaudeResponse {
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_creation_input_tokens?: number;
    readonly cache_read_input_tokens?: number;
  };
}

async function parseClaudeResponse(
  res: FetchResponse,
  logger?: Logger,
): Promise<AcImplementationResult> {
  const json = (await res.json()) as ClaudeResponse;
  const text = (json.content ?? [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('');
  const usage = json.usage ?? {};
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const cacheHit = cacheRead > 0;
  const tokensUsed =
    (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + cacheRead + cacheCreate;
  if (cacheHit) {
    logger?.debug?.(`ClaudeAiAdapter: cache HIT (${cacheRead} tokens reused)`);
  } else {
    logger?.debug?.(`ClaudeAiAdapter: cache MISS (created ${cacheCreate} tokens)`);
  }
  if (!text) {
    return { ok: false, reason: 'empty response', tokensUsed, cacheHit };
  }
  return { ok: true, generatedCode: stripFence(text), tokensUsed, cacheHit };
}

/** Strip an optional ```ts ... ``` fence if Claude added one despite instructions. */
function stripFence(raw: string): string {
  const m = raw.match(/^```(?:ts|typescript)?\s*\n([\s\S]*?)\n```\s*$/);
  return m && m[1] !== undefined ? m[1] : raw.trim();
}

function isTransient(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status <= 599);
}

async function safeText(res: FetchResponse): Promise<string> {
  try {
    return await res.text();
  } catch {
    
    return '';
  }
}

/* Coverage rationale:  — real setTimeout wrapper, replaced in tests via deps.sleep. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
