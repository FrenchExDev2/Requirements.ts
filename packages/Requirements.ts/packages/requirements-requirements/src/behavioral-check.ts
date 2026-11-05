import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDiscoverableTraceabilityRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Behavioural check via mutation testing — the only true non-declarative
 * grounding of "does this test exercise its declared AC?".
 *
 * Scope: opt-in, per-AC, dev-only. NEVER part of `compliance --strict` /
 * CI gates (cost: ~5-10 min/AC, see plan). Lives next to the AST smell
 * scanner (`test-smells`) as the deeper behavioural complement.
 *
 * The planning layer (pure functions) is what is dog-fooded here. The
 * actual Stryker invocation is a thin shell on top — its tests live with
 * the CLI wiring, not in this feature.
 */
@Satisfies(
  ReqDiscoverableTraceabilityRequirement,
)
export abstract class BehavioralCheckFeature extends Feature {
  readonly id = 'BEHAVIORAL-CHECK';
  readonly title = 'Behavioural check — mutation-testing scoped per AC, dev opt-in, never in --strict';
  readonly priority = Priority.High;

  // ── planBehavioralCheck (pure: BindingsManifest × F × ac → mutate + test scope) ──
  abstract collectsMutateFilesFromTargetsOfMatchingAcMethods(): ACResult;
  abstract collectsTestFilesFromMatchingAcMethods(): ACResult;
  abstract restrictsMutateFilesToConfiguredScope(): ACResult;
  abstract dedupesMutateAndTestFilePaths(): ACResult;
  abstract reportsVacuousWhenNoTargetsForAc(): ACResult;
  abstract reportsVacuousWhenAcNotFoundInManifest(): ACResult;
  abstract reportsVacuousWhenFeatureNotFoundInManifest(): ACResult;
  abstract returnsSortedMutateAndTestFileLists(): ACResult;
  abstract expandsTestFilesToCoverAllMutateTargets(): ACResult;

  // ── buildStrykerConfig (pure: plan + root → Stryker options) ──
  abstract buildsStrykerConfigWithMutateAndTestFiles(): ACResult;
  abstract resolvesVitestRunnerPluginViaRepoRoot(): ACResult;
  abstract disablesCheckersByDefault(): ACResult;
  abstract setsConcurrencyToOneForPredictability(): ACResult;
  abstract setsCleanTempDirTrue(): ACResult;
  abstract pointsAtVitestConfigRelativeToPackage(): ACResult;
  abstract setsIgnoreStaticTrueByDefault(): ACResult;
  abstract enablesTypescriptCheckerWhenStrictTypesRequested(): ACResult;

  // ── classifyVerdict (pure: score + threshold → verdict) ──
  abstract classifiesVacuousWhenPlanFlaggedVacuous(): ACResult;
  abstract classifiesFailWhenZeroMutantsKilled(): ACResult;
  abstract classifiesWarnWhenScoreBelowThreshold(): ACResult;
  abstract classifiesPassWhenScoreAtOrAboveThreshold(): ACResult;
  abstract defaultsThresholdToZero(): ACResult;

  // ── aggregateByAc (pure: single global Stryker report → per-AC scores) ──
  abstract aggregatesEntriesAcrossEveryAcSeenInParseResults(): ACResult;
  abstract countsMutantAsKilledOnlyWhenKilledByOneOfAcOwnTests(): ACResult;
  abstract restrictsMutantsToFilesThatAcTouches(): ACResult;
  abstract restrictsMutantsToThoseCoveredByAcOwnTests(): ACResult;
  abstract marksAcVacuousWhenNoMutantIsRelevant(): ACResult;
  abstract returnsGlobalScoreOverAllRelevantMutants(): ACResult;
  abstract sortsAuditEntriesByAcId(): ACResult;
}
