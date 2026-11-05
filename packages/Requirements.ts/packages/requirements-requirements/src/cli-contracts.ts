import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqCompleteQualificationRequirement } from './qualification-contracts.js';
import { ReqDogFoodRequirement } from './req-dog-food.js';
import { ReqVersionedTraceabilityRequirement } from './req-versioned-traceability.js';

@Satisfies(ReqCompleteQualificationRequirement, ReqDogFoodRequirement, ReqVersionedTraceabilityRequirement)
export abstract class CliDispatchContractsFeature extends Feature {
  readonly id = 'CLI-DISPATCH-CONTRACTS';
  readonly title = 'Executable Requirements CLI routes preserve domain results and failure verdicts';
  readonly priority = Priority.Critical;
  abstract commandTreesAreIndependentAndAwaitActions(): ACResult; // expects: integration
  abstract qualificationRefusesMissingEvidence(): ACResult; // expects: integration
  abstract traceQueriesResolveAndReportMissingTargets(): ACResult; // expects: integration
  abstract staticComplianceRemainsDistinctFromQualification(): ACResult; // expects: integration
  abstract graphOutputsFollowExplicitFormatAndDestination(): ACResult; // expects: integration
  abstract scaffoldingPreservesAlreadyCoveredAcs(): ACResult; // expects: integration
  abstract versionPinDriftBlocksStrictAnalysisWithinBudget(): ACResult; // expects: integration
  abstract evidenceCollectorRetainsExactInputsBuildsAndPartialResults(): ACResult; // expects: integration
  abstract evidenceCollectorReconstructsActualRunnerOutputs(): ACResult; // expects: integration
  abstract evidenceCollectorRejectsInvalidOrReusedCampaigns(): ACResult; // expects: integration
  abstract workspaceQualificationPersistsThePublicEngineVerdict(): ACResult; // expects: integration
}
