import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqLowFrictionAcsRequirement } from './req-low-friction-acs.js';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';

/** Tier-2 roadmap — enriched ACs for implementer agent. */
@Satisfies(
  ReqLowFrictionAcsRequirement,
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class FeatureHeuristicSuggesterFeature extends Feature {
  readonly id = 'FEATURE-HEURISTIC-SUGGESTER';
  readonly title = 'Wizard AC name suggester — n-gram + verb patterns from repo corpus, zero LLM';
  readonly priority = Priority.Low;
  readonly enabled = false;

  // ── Positive path ──
  abstract acSuggesterReturnsPlausibleNames(): ACResult;
  abstract acSuggesterIsDeterministicAndOffline(): ACResult;
  abstract acSuggesterRanksByDocumentedScore(): ACResult;
  abstract acSuggesterReturnsBetweenThreeAndFiveCandidates(): ACResult;

  // ── Error / validation paths ──
  abstract acSuggesterDegradesGracefullyOnEmptyCorpus(): ACResult;
  abstract acSuggesterRejectsInvalidCamelCaseCandidates(): ACResult;

  // ── Integration ──
  abstract acSuggesterReadsCorpusViaFileSystemPort(): ACResult;
  abstract acSuggesterIsCalledFromWizardBeforeAcPrompt(): ACResult;

  // ── End-to-end ──
  abstract endToEndWizardAcceptsSuggestionViaTab(): ACResult;
}
