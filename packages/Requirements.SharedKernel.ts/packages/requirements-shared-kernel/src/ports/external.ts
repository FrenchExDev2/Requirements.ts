/**
 * External-world ports (hexagonal architecture).
 *
 * Every factory state machine in `src/lib/**` and every build-tooling module
 * in `scripts/lib/**` depends on these typed interfaces — never on the real
 * globals (`document`, `localStorage`, `navigator.clipboard`, `fetch`,
 * `setTimeout`, `WebSocket`, `fs`, `child_process`).
 *
 * Thin adapters in the IIFE layer (`src/*.ts` top-level, `scripts/cli/**`)
 * wrap the real globals and inject them as deps. The adapters are trivial and
 * exercised by end-to-end tests only; they are NOT unit-tested here.
 *
 * Rule: a factory that imports `document` / `window` / `localStorage` / `fetch`
 * directly is a SOLID violation. Always take the capability as a dep.
 */

/** Simple sync key-value storage interface (localStorage-compatible). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Browser-world ports
// ────────────────────────────────────────────────────────────────────────────

/** `element.classList` — narrow. */
export interface ClassListLike {
  add(...names: string[]): void;
  remove(...names: string[]): void;
  contains(name: string): boolean;
  toggle(name: string, force?: boolean): boolean;
}

/** `element.style` as a port — read/write CSS properties without pulling HTMLElement. */
export interface StyleLike {
  setProperty(name: string, value: string, priority?: string): void;
  removeProperty(name: string): string;
  getPropertyValue(name: string): string;
}

/** Minimal DOM Event surface — keep `lib` on ES2022 only (no DOM). */
export interface EventLike {
  readonly type: string;
  preventDefault?(): void;
  stopPropagation?(): void;
}

/** @deprecated Prefer EventLike; alias kept for port call sites. */
export type Event = EventLike;

export interface AddEventListenerOptions {
  capture?: boolean;
  once?: boolean;
  passive?: boolean;
}

export interface EventListenerOptions {
  capture?: boolean;
}

/** Minimum element surface — attribute, classList, event listeners. */
export interface ElementLike {
  classList: ClassListLike;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (ev: Event) => void, opts?: AddEventListenerOptions | boolean): void;
  removeEventListener?(type: string, listener: (ev: Event) => void, opts?: EventListenerOptions | boolean): void;
  dispatchEvent?(ev: Event): boolean;
}

/** Element with a one-shot transitionend listener — for theme transitions etc. */
export interface TransitionTarget {
  addEventListener(type: 'transitionend', listener: () => void, opts: { once: true }): void;
}

/** `navigator.clipboard` port. */
export interface Clipboard {
  writeText(text: string): Promise<void>;
  readText?(): Promise<string>;
}

/** Window matchMedia port — used for theme/breakpoint detection. */
export interface MediaQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (ev: { matches: boolean }) => void): void;
  removeEventListener?(type: 'change', listener: (ev: { matches: boolean }) => void): void;
}

/** `window.matchMedia(query)` factory. */
export interface MatchMedia {
  (query: string): MediaQuery;
}

/** `window.location` + `window.history` port for SPA routing. */
export interface LocationLike {
  readonly href: string;
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}

export interface HistoryLike {
  pushState(state: unknown, title: string, url: string): void;
  replaceState(state: unknown, title: string, url: string): void;
  back(): void;
  forward(): void;
}

/** Minimal window shape — avoid `globalThis` / full `Window` typing. */
export interface WindowLike {
  location: LocationLike;
  history: HistoryLike;
  matchMedia?: MatchMedia;
  innerWidth: number;
  innerHeight: number;
  scrollX: number;
  scrollY: number;
  addEventListener(type: string, listener: (ev: Event) => void, opts?: AddEventListenerOptions | boolean): void;
  removeEventListener?(type: string, listener: (ev: Event) => void, opts?: EventListenerOptions | boolean): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Timing & animation ports
// ────────────────────────────────────────────────────────────────────────────

/** Cancellation handle — calling it removes the pending scheduled callback. */
export type Cancel = () => void;

/** Scheduler port — replaces `setTimeout` / `setInterval` / `requestAnimationFrame`. */
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): Cancel;
  setInterval(fn: () => void, ms: number): Cancel;
  requestAnimationFrame?(fn: (t: number) => void): Cancel;
}

/** Wall clock port — replaces `Date.now()`. */
export interface Clock {
  now(): number;
}

// ────────────────────────────────────────────────────────────────────────────
// Networking ports
// ────────────────────────────────────────────────────────────────────────────

export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
  readonly headers?: { get(name: string): string | null };
}

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: { aborted: boolean };
}

/** `fetch` port. */
export interface Fetcher {
  (url: string, init?: FetchInit): Promise<FetchResponse>;
}

/** WebSocket port — client side. */
export interface WsClient {
  readonly readyState: number;
  send(msg: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'close', listener: (ev: { code: number; reason: string }) => void): void;
  addEventListener(type: 'message', listener: (ev: { data: string }) => void): void;
  addEventListener(type: 'error', listener: (ev: unknown) => void): void;
  removeEventListener?(type: string, listener: (...args: unknown[]) => void): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Diagnostics ports
// ────────────────────────────────────────────────────────────────────────────

/** Logger port — replaces raw `console.*` calls in libs. */
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug?(msg: string, ...args: unknown[]): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Node-world ports (scripts/lib/**)
// ────────────────────────────────────────────────────────────────────────────

/** Read-only file system capabilities used by discovery and analysis. */
export interface ReadableFileSystem {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  exists(path: string): Promise<boolean>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ mtimeMs: number; isDirectory(): boolean; size: number }>;
}

/** Writable file system port — narrow subset of `fs/promises`. */
export interface FileSystem extends ReadableFileSystem {
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  unlink?(path: string): Promise<void>;
  copyFile?(src: string, dst: string): Promise<void>;
  rm?(path: string): Promise<void>;
}

/** Command runner port — replaces `child_process.exec` / `execSync`. */
export interface CommandRunner {
  exec(cmd: string, opts?: { cwd?: string; env?: Record<string, string>; encoding?: 'utf8' }): Promise<{ stdout: string; stderr: string; code: number }>;
}

/**
 * Version-control port — narrow surface for the codegen-safety check:
 * refuse to overwrite a file that exists on disk but isn't tracked by VCS
 * (likely human WIP the user hasn't committed yet).
 *
 * Real adapter shells out to `git ls-files --error-unmatch <path>` via
 * `CommandRunner`; tests inject a scripted tracker.
 */
export interface Vcs {
  isTracked(path: string): Promise<boolean>;
}

/** Process environment port — replaces `process.env` / `process.argv`. */
export interface ProcessEnv {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  exit?(code: number): void;
}

/** Output sink port — replaces `process.stdout.write` / `process.stderr.write`. */
export interface OutputSink {
  write(text: string): void;
  isTty(): boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Interactive prompt port — wraps @clack/prompts in the real adapter,
// scripted mock in tests. Wizards depend on this interface, never on clack.
// ────────────────────────────────────────────────────────────────────────────

export interface PromptTextOptions {
  readonly default?: string;
  readonly placeholder?: string;
  /** Return undefined for valid input, or a string error message to reject it. */
  readonly validate?: (s: string) => string | undefined;
}

export interface PromptChoice<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

/** Minimal spinner surface — start/stop messages. */
export interface PromptSpinner {
  start(message: string): void;
  stop(message: string): void;
}

/**
 * Prompt port — fully async, structural subtype of @clack/prompts' named exports.
 * Test adapters inject scripted answers; production adapter wraps clack 1:1.
 */
export interface Prompt {
  text(question: string, opts?: PromptTextOptions): Promise<string>;
  select<T extends string>(question: string, choices: readonly PromptChoice<T>[], dflt?: T): Promise<T>;
  multiselect<T extends string>(question: string, choices: readonly PromptChoice<T>[], dflt?: readonly T[]): Promise<readonly T[]>;
  confirm(question: string, dflt?: boolean): Promise<boolean>;
  /** Print a titled note / diff block between prompts. */
  note(message: string, title?: string): void;
  spinner(): PromptSpinner;
}

// ────────────────────────────────────────────────────────────────────────────
// Fit criterion adapter port — per-kind, pluggable evaluator.
// Stream E ships unit-test + coverage-threshold adapters; others are stubs
// returning Pending until a project plugs in its own implementation.
// ────────────────────────────────────────────────────────────────────────────

export interface AdapterContext {
  readonly fs: FileSystem;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Project root — adapters resolve paths relative to this. */
  readonly root: string;
}

/**
 * Evaluates a FitCriterion of a single kind against real-world evidence.
 * Generic over the criterion variant — the discriminant `kind` narrows the input.
 */
export interface FitCriterionAdapter<K extends string = string> {
  readonly kind: K;
  /** Evaluate one criterion. Implementations receive only criteria matching `kind`. */
  evaluate(criterion: unknown, context: AdapterContext): Promise<unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Toggle provider port — orthogonal feature-flag / AC toggling.
// Policy stays outside the traceability DSL: the DSL only knows "gate name →
// on/off". Projects plug LaunchDarkly / GrowthBook / Unleash / env-files via
// a thin adapter that implements ToggleProvider.
// ────────────────────────────────────────────────────────────────────────────

/** Deployment environment tag — open-world but with a recognised canonical set. */
export type ToggleEnv = 'dev' | 'staging' | 'prod';
export const KNOWN_TOGGLE_ENVS: readonly ToggleEnv[] = ['dev', 'staging', 'prod'];

/**
 * Context propagated to a ToggleProvider at resolve time. All fields optional —
 * providers decide which dimensions they care about. `now` is ISO-8601 string
 * so the resolver can defer to a Clock port for testability.
 */
export interface ToggleContext {
  readonly env?: ToggleEnv;
  readonly tier?: string;
  readonly userId?: string;
  readonly now?: string;
  readonly [key: string]: unknown;
}

/**
 * ToggleProvider port — the single method adapters implement. Returning `true`
 * means "gate is on, AC runs / counts toward coverage"; `false` means the AC
 * is intentionally NotApplicable in this context (excluded from strict gate).
 */
export interface ToggleProvider {
  isEnabled(gate: string, context?: ToggleContext): boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Composite dep bags — common shapes
// ────────────────────────────────────────────────────────────────────────────

/** A factory that wires a DOM interaction typically needs these. */
export interface BrowserDeps {
  window: WindowLike;
  storage: KeyValueStorage;
  scheduler: Scheduler;
  clipboard?: Clipboard;
  logger?: Logger;
}

/** A factory that wires a CLI / Node tool typically needs these. */
export interface NodeDeps {
  fs: FileSystem;
  runner: CommandRunner;
  process: ProcessEnv;
  stdout: OutputSink;
  stderr: OutputSink;
  logger: Logger;
}

