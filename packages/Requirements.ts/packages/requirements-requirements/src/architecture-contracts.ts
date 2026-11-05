import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqStyleOpenClosedRequirement } from './req-style-open-closed.js';
import { ReqStyleSeparatedConcernsRequirement } from './req-style-separated-concerns.js';
import { ReqStyleCompileTimeNarrowingRequirement } from './req-style-compile-time-narrowing.js';
import { ReqTuiModernRequirement } from './req-tui-modern.js';
import { ReqDslCompleteRequirement } from './req-dsl-complete.js';
import { ReqVocabIndustryAlignedRequirement } from './req-vocab-industry-aligned.js';

/** Present source obligations replacing manual architecture/document inspections. */
@Satisfies(ReqStyleOpenClosedRequirement, ReqStyleSeparatedConcernsRequirement, ReqStyleCompileTimeNarrowingRequirement, ReqTuiModernRequirement, ReqDslCompleteRequirement, ReqVocabIndustryAlignedRequirement)
export abstract class ArchitectureContractsFeature extends Feature {
  readonly id = 'ARCHITECTURE-CONTRACTS';
  readonly title = 'Observable interface, dependency, prompt and traceability vocabulary boundaries';
  readonly priority = Priority.Critical;
  abstract styleUsesInterfacesAndInjectedVocabulary(): ACResult;
  abstract styleConcernsHaveIndependentPublicInterfaces(): ACResult;
  abstract promptsStayBehindTheirPort(): ACResult;
  abstract documentsCanonicalTraceabilityAndInverseLinks(): ACResult;
}
