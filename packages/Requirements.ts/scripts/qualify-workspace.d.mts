import type { QualificationReport } from '../packages/requirements-compliance/src/qualification.js';
/** Reuse the public engine and persist its complete or partial workspace report. */
export function qualifyWorkspace(args?: readonly string[], options?: { root?: string }): Promise<QualificationReport>;
