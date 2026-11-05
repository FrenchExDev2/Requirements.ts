/** Collect actual inputs/outputs for one campaign without executing any test. */
export function collectQualificationEvidence(operation: string, runId: string, options?: { root?: string }): Promise<{
  runId: string;
  platform: string;
  inputs: number;
} | {
  file: string;
  state: string;
  tests: number;
  coverageFiles: number;
  mutantFiles: number;
  strategyRuns: number;
}>;
