import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqTuiModernRequirement } from './req-tui-modern.js';
import { ReqParallelDeliverableRequirement } from './req-parallel-deliverable.js';
import { ReqDogFoodRequirement } from './req-dog-food.js';

/**
 * Self-Feature for the @clack/prompts adapter.
 * Owned by Stream D. Isolated from FeatureNewCommandFeature so Stream A's ACs
 * and Stream D's ACs stay disjoint — SOLID single-responsibility.
 */
@Satisfies(
  ReqTuiModernRequirement,               // primary — this adapter IS how we meet REQ-TUI-MODERN
  ReqParallelDeliverableRequirement,
  ReqDogFoodRequirement,
)
export abstract class ClackAdapterFeature extends Feature {
  readonly id = 'CLACK-ADAPTER';
  readonly title = '@clack/prompts adapter — realPrompt() + openInEditor(), no readline, no raw process';
  readonly priority = Priority.Medium;

  // Port completeness
  abstract realPromptExposesAllPromptMethods(): ACResult;

  // Per-method clack delegation (SOLID: each method in isolation)
  abstract realPromptTextDelegatesToClackText(): ACResult;
  abstract realPromptSelectDelegatesToClackSelect(): ACResult;
  abstract realPromptMultiselectDelegatesToClackMultiselect(): ACResult;
  abstract realPromptConfirmDelegatesToClackConfirm(): ACResult;
  abstract realPromptNoteDelegatesToClackNote(): ACResult;
  abstract realPromptSpinnerDelegatesToClackSpinner(): ACResult;

  // Cancellation — clack returns a Symbol when the user hits Ctrl+C; we normalise
  // it into a typed error. One AC per entry point that can cancel.
  abstract textCancellationThrowsPromptCancelledError(): ACResult;
  abstract selectCancellationThrowsPromptCancelledError(): ACResult;
  abstract multiselectCancellationThrowsPromptCancelledError(): ACResult;
  abstract confirmCancellationThrowsPromptCancelledError(): ACResult;

  // Editor shell
  abstract openInEditorShellsThroughCommandRunnerPort(): ACResult;
  abstract openInEditorQuotesPathsForShellSafety(): ACResult;
  abstract openInEditorIsNoOpOnEmptyPathList(): ACResult;
  abstract openInEditorSilentlySwallowsRunnerFailures(): ACResult;

  // Cancellation semantics
  abstract promptCancelledErrorExtendsError(): ACResult;
  abstract promptCancelledErrorAcceptsCustomMessage(): ACResult;

  // Isolation invariants — tested via source-file introspection
  abstract moduleHasNoReadlineImport(): ACResult;
  abstract moduleHasNoDirectProcessOrChildProcessImport(): ACResult;
}
