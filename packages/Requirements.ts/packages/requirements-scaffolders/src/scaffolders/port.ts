/**
 * TestScaffolder port — pure interface, no I/O.
 *
 * One scaffolder per TestLevel. Consumers plug in new scaffolders via the
 * registry (see ./registry.ts). Implementations MUST emit source that uses
 * `@FeatureTest` + `@Verifies` — never `describe`/`it`.
 */

import type { FeatureMeta, TestLevel } from '@frenchexdev2/requirements-compliance';
import type { UncoveredAC } from '../stub-templates.js';

export type { UncoveredAC };

export interface TestScaffolder {
  /** The TestLevel this scaffolder targets. */
  readonly level: TestLevel;

  /** Default target directory, relative to the project root. */
  readonly defaultDir: string;

  /** Filename suffix for scaffolded files (e.g. `.test.ts`, `.spec.ts`). */
  readonly filenameSuffix: string;

  /** Short human description — surfaced by `requirements scaffold --help`. */
  readonly description: string;

  /**
   * Generate the test file source for a Feature's uncovered ACs.
   * Returns '' when `uncovered` is empty so the consumer can filter.
   */
  generate(feature: FeatureMeta, uncovered: readonly UncoveredAC[]): string;
}
