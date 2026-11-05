import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqAuditTrailHooksRequirement } from './req-audit-trail-hooks.js';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';

/** Tier-2 roadmap — C9. Hook-only implementation; crypto deferred to Tier 3. */
@Satisfies(
  ReqAuditTrailHooksRequirement,
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class AuditHooksFeature extends Feature {
  readonly id = 'AUDIT-TRAIL-HOOKS';
  readonly title = 'Audit-trail hooks — extended ChangeKind + optional signature field + no-op decorators';
  readonly priority = Priority.Medium;
  readonly enabled = false;

  // ── Type-level surface ──
  abstract changeKindUnionIncludesReviewedAndApprovedBy(): ACResult;
  abstract historyEntryCarriesOptionalSignature(): ACResult;
  abstract signatureShapeIsEd25519OrRsaSha256(): ACResult;

  // ── Decorator surface ──
  abstract reviewedDecoratorExistsAsNoOp(): ACResult;
  abstract signedOffDecoratorExistsAsNoOp(): ACResult;

  // ── Invariant ──
  abstract historyAppendIsImmutable(): ACResult;

  // ── Integration ──
  abstract existingHistorySerialisationStaysBackwardCompatible(): ACResult;

  // ── End-to-end ──
  abstract endToEndSignedHistoryEntryRoundTripsThroughSpecJson(): ACResult;
}
