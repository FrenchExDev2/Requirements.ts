import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { StyleReporterFeature } from '@frenchexdev2/requirements-requirements';
import { FixtureStyle } from './_style-fixture';

@FeatureTest(StyleReporterFeature)
class StyleReporterContractTests {
  @Verifies<StyleReporterFeature>('renderStatementReturnsString')
  'renderStatement returns a non-empty string for a valid statement'() {
    const out = FixtureStyle.reporter.renderStatement({ pattern: 'ubiquitous', response: 'do X' });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  }

  @Verifies<StyleReporterFeature>('renderRequirementReturnsString')
  'renderRequirement returns a non-empty string for a valid spec'() {
    const out = FixtureStyle.reporter.renderRequirement({ id: 'REQ-1', title: 'Example' });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  }

  @Verifies<StyleReporterFeature>('renderMarkdownProducesMarkdown')
  'renderMarkdown output contains at least one Markdown heading'() {
    const out = FixtureStyle.reporter.renderMarkdown({ id: 'REQ-1', title: 'Example' });
    expect(typeof out).toBe('string');
    expect(out).toMatch(/^#/m);
  }
}

void StyleReporterContractTests;
