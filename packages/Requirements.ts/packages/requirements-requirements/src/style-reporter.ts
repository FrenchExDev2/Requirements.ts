import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqStyleOpenClosedRequirement } from './req-style-open-closed.js';
import { ReqStyleSeparatedConcernsRequirement } from './req-style-separated-concerns.js';

/**
 * RequirementReporter — the rendering port: how a Style turns a Requirement into human output.
 * Three entrypoints cover the three call sites: inline statement rendering, `requirement show`
 * console output, and `requirement export --format md` Markdown generation.
 */
@Satisfies(
  ReqStyleOpenClosedRequirement,
  ReqStyleSeparatedConcernsRequirement,
)
export abstract class StyleReporterFeature extends Feature {
  readonly id = 'STYLE-REPORTER';
  readonly title = 'RequirementStyle — reporter port (statement / requirement / markdown)';
  readonly priority = Priority.Critical;

  abstract renderStatementReturnsString(): ACResult;
  abstract renderRequirementReturnsString(): ACResult;
  abstract renderMarkdownProducesMarkdown(): ACResult;
}
