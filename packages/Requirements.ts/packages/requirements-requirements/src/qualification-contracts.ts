import { Feature, Requirement, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDogFoodRequirement } from './req-dog-food.js';

/** The complete policy is itself a product contract, including its failure behavior. */
export abstract class ReqCompleteQualificationRequirement extends Requirement {
  readonly id = 'REQ-COMPLETE-QUALIFICATION';
  readonly title = 'Qualify every declared contract against fresh complete cross-platform evidence';
  readonly priority = Priority.Critical;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;
  readonly statement = { pattern: 'ubiquitous' as const, response: 'qualify all declared Requirements, Features, acceptance criteria and executable product files using individually passing decorated tests, 100% code/AC coverage, replayable property/fuzz runs and a standard Stryker score of 100% on Windows and Linux.' };
  readonly rationale = { kind: 'principle' as const, claim: 'A qualification verdict must reject missing, stale, contradictory, interrupted or vacuous evidence.', evidence: [] };
  readonly fitCriteria = [{ kind: 'unit-test' as const, describes: 'The qualification engine rejects incomplete or inconsistent evidence.', binds: ['rejectsMissingStaleOrInterruptedProof', 'requiresCompleteCoverage', 'interpretsStrykerWithoutVacuousSuccess', 'requiresAllPlatformsAndChecks'] }];
  readonly verificationMethod = 'Test' as const;
  readonly source = { type: 'stakeholder' as const, role: 'complete-self-qualification', date: '2026-11-03' };
  readonly risk = { level: 'Critical' as const, ifNotMet: 'An incomplete or stale campaign can be advertised as complete qualification.' };
}

@Satisfies(ReqCompleteQualificationRequirement, ReqDogFoodRequirement)
export abstract class QualificationFeature extends Feature {
  readonly id = 'COMPLETE-QUALIFICATION';
  readonly title = 'Canonical inventory and fail-closed complete qualification';
  readonly priority = Priority.Critical;
  abstract rejectsEmptyOrContradictoryInventory(): ACResult;
  abstract verifiesEveryDeclaredCriterion(): ACResult;
  abstract rejectsUnboundOrAssertionlessTests(): ACResult;
  abstract requiresAllLevelsIncludingDisabled(): ACResult;
  abstract rejectsMissingStaleOrInterruptedProof(): ACResult;
  abstract requiresCompleteCoverage(): ACResult;
  abstract requiresReplayableStrategies(): ACResult;
  abstract interpretsStrykerWithoutVacuousSuccess(): ACResult;
  abstract requiresAllPlatformsAndChecks(): ACResult;
  abstract inspectsAliasedTestRegistration(): ACResult;
  abstract discoversCanonicalContractsWithoutExecuting(): ACResult;
  abstract loadsRetainedEvidenceSafely(): ACResult;
  abstract exposesStrictQualificationCli(): ACResult; // expects: integration
  abstract matchesRunnerProofWithoutInferringSuccess(): ACResult;
  abstract normalizesCoverageCounters(): ACResult;
  abstract retainsEveryMutantStatus(): ACResult;
}

/** Contracts for previously unbound workspace integration tests and orchestration. */
@Satisfies(ReqCompleteQualificationRequirement)
export abstract class QualificationInfrastructureFeature extends Feature {
  readonly id = 'QUALIFICATION-INFRASTRUCTURE';
  readonly title = 'Individual evidence matching, real CLI entrypoints, filesystem and monitoring';
  readonly priority = Priority.Critical;
  abstract matchesIndividualExecutionEvidence(): ACResult; // expects: integration
  abstract preservesGeneratedTestLevelObligations(): ACResult; // expects: integration
  abstract resolvesInstalledCliEntrypoints(): ACResult; // expects: integration
  abstract preservesLiteralCliArguments(): ACResult; // expects: integration
  abstract synchronizesRealFilesystemIdempotently(): ACResult; // expects: integration
  abstract refusesUnsafeFilesystemPlans(): ACResult; // expects: integration
  abstract monitorsUtcDurations(): ACResult; // expects: integration
  abstract observesParallelWorkerFailures(): ACResult; // expects: integration
  abstract rejectsUnexecutedAssertions(): ACResult; // expects: integration
}
