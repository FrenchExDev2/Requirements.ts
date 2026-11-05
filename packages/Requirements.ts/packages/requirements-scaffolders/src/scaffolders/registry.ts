/**
 * TestScaffolder registry — one lookup per TestLevel, project-extensible.
 *
 * SOLID notes:
 *  - OCP: `register()` adds/overrides scaffolders without modifying built-ins.
 *  - DIP: registry depends only on the `TestScaffolder` port.
 *  - ISP: tiny surface — get / list / register.
 */

import type { TestLevel } from '@frenchexdev2/requirements-compliance';
import type { TestScaffolder } from './port.js';
import { UnitScaffolder } from './unit.js';
import { E2eScaffolder } from './e2e.js';
import { FunctionalScaffolder } from './functional.js';
import { A11yScaffolder } from './a11y.js';
import { I18nScaffolder } from './i18n.js';
import { VisualScaffolder } from './visual.js';
import { PerfScaffolder } from './perf.js';

export interface ScaffolderRegistry {
  get(level: TestLevel): TestScaffolder | undefined;
  list(): readonly TestScaffolder[];
  register(scaffolder: TestScaffolder): void;
}

/** The seven built-ins — one per TestLevel. */
export const BUILT_IN_SCAFFOLDERS: readonly TestScaffolder[] = [
  UnitScaffolder,
  FunctionalScaffolder,
  E2eScaffolder,
  A11yScaffolder,
  I18nScaffolder,
  VisualScaffolder,
  PerfScaffolder,
];

class MapScaffolderRegistry implements ScaffolderRegistry {
  private readonly byLevel = new Map<TestLevel, TestScaffolder>();

  constructor(initial: readonly TestScaffolder[]) {
    for (const s of initial) this.byLevel.set(s.level, s);
  }

  get(level: TestLevel): TestScaffolder | undefined {
    return this.byLevel.get(level);
  }

  list(): readonly TestScaffolder[] {
    return Array.from(this.byLevel.values());
  }

  register(scaffolder: TestScaffolder): void {
    this.byLevel.set(scaffolder.level, scaffolder);
  }
}

/** Factory for a fresh registry — useful in tests (no global-state bleed). */
export function createRegistry(
  scaffolders: readonly TestScaffolder[] = BUILT_IN_SCAFFOLDERS,
): ScaffolderRegistry {
  return new MapScaffolderRegistry(scaffolders);
}

/** The default registry, pre-populated with the six built-ins. */
export const DEFAULT_REGISTRY: ScaffolderRegistry = createRegistry();
