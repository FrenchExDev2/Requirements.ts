import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDslCompleteRequirement } from './req-dsl-complete.js';
import { ReqVocabIndustryAlignedRequirement } from './req-vocab-industry-aligned.js';

@Satisfies(
  ReqDslCompleteRequirement,
  ReqVocabIndustryAlignedRequirement,
)
export abstract class DecoratorsFeature extends Feature {
  readonly id = 'DECORATORS';
  readonly title = 'Requirements DSL — decorators (@FeatureTest, @Verifies, @Expects, @Exclude, @Satisfies, @Refines)';
  readonly priority = Priority.Critical;

  // ── Registry accessors ──
  abstract getRequirementRegistryReturnsRegisteredRefs(): ACResult;
  abstract getExcludedMethodsReturnsExcludedSet(): ACResult;
  abstract getSatisfactionLinksReturnsRegisteredLinks(): ACResult;
  abstract getRefinementLinksReturnsRegisteredLinks(): ACResult;

  // ── @Satisfies / @Refines (SysML satisfy/refine) ──
  abstract satisfiesDecoratorAppendsLinkWithFeatureAndRequirementNames(): ACResult;
  abstract refinesDecoratorAppendsLinkWithChildAndParentNames(): ACResult;

  // ── @FeatureTest ──
  abstract featureTestStampsFeatureMetadataOnClass(): ACResult;
  abstract featureTestBackfillsFeatureNameOnPriorRegistryEntries(): ACResult;
  abstract featureTestAutoRegistersWithVitestGlobals(): ACResult;
  abstract featureTestSkipsAutoRegistrationWhenGlobalsAbsent(): ACResult;
  abstract featureTestSkipsConstructorMember(): ACResult;
  abstract featureTestSkipsExcludedMethods(): ACResult;
  abstract featureTestPassesTimeoutOptionToVitest(): ACResult;

  // ── @Verifies ──
  abstract verifiesAddsRefToRegistryWithEmptyFeature(): ACResult;
  abstract verifiesCapturesTestClassAndMethodNames(): ACResult;

  // ── @Expects ──
  abstract expectsIsNoOpAtRuntime(): ACResult;

  // ── @Exclude ──
  abstract excludeAddsMethodKeyToExcludedSet(): ACResult;
}
