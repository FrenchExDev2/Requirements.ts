import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ComplianceReportFeature } from '@frenchexdev2/requirements-requirements';
import {
  hasBareDescribeOrIt,
  glyphFor,
  formatRuntimeCell,
  formatBindingsCell,
  formatBindingsCellColored,
  traceabilityGlyph,
  type FeatureCoverage,
} from '../../src/compliance-report';
import type { RuntimeCoverage } from '../../src/compliance-core';

// ── factories ─────────────────────────────────────────────────────────────
const rc = (partial: Partial<RuntimeCoverage> & { status: RuntimeCoverage['status'] }): RuntimeCoverage => ({
  declared: 0, found: 0, missing: [], minLinesPct: null, ...partial,
});

function fc(overrides: Partial<FeatureCoverage> = {}): FeatureCoverage {
  return {
    id: 'F1',
    title: 'F1',
    priority: 'medium',
    enabled: true,
    sourceFiles: [],
    acs: [],
    coveredCount: 0,
    totalCount: 0,
    percentage: 100,
    runtimeCoverage: rc({ status: 'ok', declared: 1, found: 1, missing: [], minLinesPct: 100 }),
    bindings: { status: 'bound', totalAcs: 0, boundAcs: 0, symbols: [] },
    satisfies: [],
    ...overrides,
  };
}

const COLORS = { r: '<R>', grn: '<G>', ylw: '<Y>', red: '<X>', dim: '<D>' };

@FeatureTest(ComplianceReportFeature)
class HasBareDescribeOrItTests {
  @Verifies<ComplianceReportFeature>('hasBareDetectsDescribeCall')
  'detects describe(...) call'() {
    expect(hasBareDescribeOrIt(`describe('x', () => {})`)).toBe(true);
  }
  @Verifies<ComplianceReportFeature>('hasBareDetectsItCall')
  'detects it(...) call'() {
    expect(hasBareDescribeOrIt(`it('x', () => {})`)).toBe(true);
  }
  @Verifies<ComplianceReportFeature>('hasBareReturnsFalseForEmptySource')
  'returns false for an empty string'() {
    expect(hasBareDescribeOrIt('')).toBe(false);
  }
  @Verifies<ComplianceReportFeature>('hasBareIgnoresImports')
  'ignores describe/it referenced inside an import line'() {
    expect(hasBareDescribeOrIt(`import { describe, it } from 'vitest';`)).toBe(false);
  }
  @Verifies<ComplianceReportFeature>('hasBareIgnoresLineComments')
  'ignores describe in a // line comment'() {
    expect(hasBareDescribeOrIt(`// describe('x', () => {})`)).toBe(false);
  }
  @Verifies<ComplianceReportFeature>('hasBareIgnoresBlockComments')
  'ignores describe in a /* block */ comment'() {
    expect(hasBareDescribeOrIt(`/* describe('x', () => {}) */`)).toBe(false);
  }
  @Verifies<ComplianceReportFeature>('hasBareIgnoresSingleQuoteStrings')
  "ignores describe inside single-quote string"() {
    expect(hasBareDescribeOrIt(`const s = 'describe(hello)';`)).toBe(false);
  }
  @Verifies<ComplianceReportFeature>('hasBareIgnoresDoubleQuoteStrings')
  'ignores it inside double-quote string'() {
    expect(hasBareDescribeOrIt(`const s = "it(hello)";`)).toBe(false);
  }
  @Verifies<ComplianceReportFeature>('hasBareIgnoresTemplateStrings')
  'ignores describe/it inside template literal'() {
    expect(hasBareDescribeOrIt('const s = `describe(x)`;')).toBe(false);
  }
}

@FeatureTest(ComplianceReportFeature)
class GlyphForTests {
  @Verifies<ComplianceReportFeature>('glyphReturnsDisabledForDisabledFeature')
  'returns ○ for disabled feature'() {
    expect(glyphFor(fc({ enabled: false }))).toBe('○');
  }
  @Verifies<ComplianceReportFeature>('glyphReturnsCrossForIncompleteCoverage')
  'returns ✗ when percentage < 100'() {
    expect(glyphFor(fc({ percentage: 50 }))).toBe('✗');
  }
  @Verifies<ComplianceReportFeature>('glyphReturnsBangForOkAcsWithRuntimeWarning')
  'returns ! when ACs 100% but runtime not ok'() {
    expect(
      glyphFor(fc({ percentage: 100, runtimeCoverage: rc({ status: 'partial', declared: 2, found: 1, missing: ['x'], minLinesPct: 50 }) }))
    ).toBe('!');
  }
  @Verifies<ComplianceReportFeature>('glyphReturnsCheckmarkForFullyCovered')
  'returns ✓ for fully covered'() {
    expect(glyphFor(fc({ percentage: 100 }))).toBe('✓');
  }
}

@FeatureTest(ComplianceReportFeature)
class FormatRuntimeCellTests {
  @Verifies<ComplianceReportFeature>('formatRuntimeCellOk')
  'ok status with plural files'() {
    expect(formatRuntimeCell(rc({ status: 'ok', declared: 3, found: 3, minLinesPct: 95 })))
      .toBe('src 95% (3 files)');
  }
  @Verifies<ComplianceReportFeature>('formatRuntimeCellOkSingleFile')
  'ok status with single file uses singular'() {
    expect(formatRuntimeCell(rc({ status: 'ok', declared: 1, found: 1, minLinesPct: 100 })))
      .toBe('src 100% (1 file)');
  }
  @Verifies<ComplianceReportFeature>('formatRuntimeCellOkSingleFile')
  'ok status with null minLinesPct renders 0%'() {
    expect(formatRuntimeCell(rc({ status: 'ok', declared: 0, found: 0, minLinesPct: null })))
      .toBe('src 0% (0 files)');
  }
  @Verifies<ComplianceReportFeature>('formatRuntimeCellPartial')
  'partial status shows missing count'() {
    expect(formatRuntimeCell(rc({ status: 'partial', declared: 3, found: 1, missing: ['a.ts', 'b.ts'], minLinesPct: 80 })))
      .toBe('src 80% (1/3 files, 2 missing)');
  }
  @Verifies<ComplianceReportFeature>('formatRuntimeCellMissing')
  'missing status shows declared count'() {
    expect(formatRuntimeCell(rc({ status: 'missing', declared: 2, missing: ['a', 'b'] })))
      .toBe('src —  (2 missing)');
  }
  @Verifies<ComplianceReportFeature>('formatRuntimeCellUndeclared')
  'undeclared status renders placeholder'() {
    expect(formatRuntimeCell(rc({ status: 'undeclared' }))).toBe('src —  (undeclared)');
  }
  @Verifies<ComplianceReportFeature>('formatRuntimeCellDisabled')
  'disabled status renders [disabled]'() {
    expect(formatRuntimeCell(rc({ status: 'disabled' }))).toBe('src —  [disabled]');
  }
}

@FeatureTest(ComplianceReportFeature)
class FormatBindingsCellTests {
  @Verifies<ComplianceReportFeature>('formatBindingsCellDisabled')
  'disabled bindings'() {
    const f = fc({ bindings: { status: 'disabled', totalAcs: 0, boundAcs: 0, symbols: [] } });
    expect(formatBindingsCell(f)).toBe('impl —  [disabled]');
  }
  @Verifies<ComplianceReportFeature>('formatBindingsCellUnboundWhenNoCoverage')
  'unbound when tu=0 and e2e=0'() {
    const f = fc({
      acs: [{ method: 'a', covered: false, tests: [], expectedLevels: ['unit'], coveredLevels: [], gapLevels: ['unit'] }],
      bindings: { status: 'unbound', totalAcs: 1, boundAcs: 0, symbols: [] },
    });
    expect(formatBindingsCell(f)).toBe('impl —  (unbound)');
  }
  @Verifies<ComplianceReportFeature>('formatBindingsCellShowsTuOnly')
  'shows TU only when no E2E'() {
    const f = fc({
      acs: [{ method: 'a', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] }],
      bindings: { status: 'bound', totalAcs: 1, boundAcs: 1, symbols: [] },
    });
    expect(formatBindingsCell(f)).toBe('impl 1 TU');
  }
  @Verifies<ComplianceReportFeature>('formatBindingsCellShowsE2eOnly')
  'shows E2E only when no TU'() {
    const f = fc({
      acs: [{ method: 'a', covered: true, tests: [], expectedLevels: ['e2e'], coveredLevels: ['e2e'], gapLevels: [] }],
      bindings: { status: 'unbound', totalAcs: 1, boundAcs: 0, symbols: [] },
    });
    expect(formatBindingsCell(f)).toBe('impl 1 E2E');
  }
  @Verifies<ComplianceReportFeature>('formatBindingsCellShowsTuAndE2e')
  'shows TU + E2E combined'() {
    const f = fc({
      acs: [
        { method: 'a', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] },
        { method: 'b', covered: true, tests: [], expectedLevels: ['e2e'], coveredLevels: ['e2e'], gapLevels: [] },
      ],
      bindings: { status: 'partial', totalAcs: 2, boundAcs: 1, symbols: [] },
    });
    expect(formatBindingsCell(f)).toBe('impl 1 TU + 1 E2E');
  }
}

@FeatureTest(ComplianceReportFeature)
class TraceabilityGlyphTests {
  @Verifies<ComplianceReportFeature>('traceabilityGlyphDisabled')
  'disabled → —'() {
    expect(traceabilityGlyph(fc({ bindings: { status: 'disabled', totalAcs: 0, boundAcs: 0, symbols: [] } })))
      .toBe('—');
  }
  @Verifies<ComplianceReportFeature>('traceabilityGlyphFullWhenAllTu')
  'full ● when tu >= covered'() {
    const f = fc({
      acs: [{ method: 'a', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] }],
      bindings: { status: 'bound', totalAcs: 1, boundAcs: 1, symbols: [] },
    });
    expect(traceabilityGlyph(f)).toBe('●');
  }
  @Verifies<ComplianceReportFeature>('traceabilityGlyphNoneWhenZeroTu')
  'none ○ when no TU bindings'() {
    const f = fc({
      acs: [{ method: 'a', covered: true, tests: [], expectedLevels: ['e2e'], coveredLevels: ['e2e'], gapLevels: [] }],
      bindings: { status: 'unbound', totalAcs: 1, boundAcs: 0, symbols: [] },
    });
    expect(traceabilityGlyph(f)).toBe('○');
  }
  @Verifies<ComplianceReportFeature>('traceabilityGlyphPartialWhenMixed')
  'partial ◐ when tu < covered'() {
    const f = fc({
      acs: [
        { method: 'a', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] },
        { method: 'b', covered: true, tests: [], expectedLevels: ['e2e'], coveredLevels: ['e2e'], gapLevels: [] },
      ],
      bindings: { status: 'partial', totalAcs: 2, boundAcs: 1, symbols: [] },
    });
    expect(traceabilityGlyph(f)).toBe('◐');
  }
}

@FeatureTest(ComplianceReportFeature)
class FormatBindingsCellColoredTests {
  @Verifies<ComplianceReportFeature>('formatColoredDisabled')
  'disabled renders dim + [disabled]'() {
    const f = fc({ bindings: { status: 'disabled', totalAcs: 0, boundAcs: 0, symbols: [] } });
    expect(formatBindingsCellColored(f, COLORS)).toBe('<D>—  [disabled]<R>');
  }
  @Verifies<ComplianceReportFeature>('formatColoredUnbound')
  'unbound renders 0/N with red'() {
    const f = fc({
      acs: [{ method: 'a', covered: false, tests: [], expectedLevels: ['unit'], coveredLevels: [], gapLevels: ['unit'] }],
      bindings: { status: 'unbound', totalAcs: 3, boundAcs: 0, symbols: [] },
    });
    expect(formatBindingsCellColored(f, COLORS)).toBe('<X>0/3 (unbound)<R>');
  }
  @Verifies<ComplianceReportFeature>('formatColoredShowsFullGlyphAndGreenTu')
  'full coverage via TU → green glyph ●'() {
    const f = fc({
      acs: [{ method: 'a', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] }],
      bindings: { status: 'bound', totalAcs: 1, boundAcs: 1, symbols: [] },
    });
    const out = formatBindingsCellColored(f, COLORS);
    expect(out).toContain('<G>1<R> TU');
    expect(out).toContain('<D>0<R> E2E');
    expect(out).toContain('<G>●<R>');
  }
  @Verifies<ComplianceReportFeature>('formatColoredShowsPartialGlyphAndYellowE2e')
  'mixed coverage → yellow glyph ◐ and yellow e2e'() {
    const f = fc({
      acs: [
        { method: 'a', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] },
        { method: 'b', covered: true, tests: [], expectedLevels: ['e2e'], coveredLevels: ['e2e'], gapLevels: [] },
      ],
      bindings: { status: 'partial', totalAcs: 2, boundAcs: 1, symbols: [] },
    });
    const out = formatBindingsCellColored(f, COLORS);
    expect(out).toContain('<G>1<R> TU');
    expect(out).toContain('<Y>1<R> E2E');
    expect(out).toContain('<Y>◐<R>');
  }
  @Verifies<ComplianceReportFeature>('formatColoredShowsNoneGlyphWhenAllE2e')
  'all E2E with no TU → red ○'() {
    const f = fc({
      acs: [{ method: 'a', covered: true, tests: [], expectedLevels: ['e2e'], coveredLevels: ['e2e'], gapLevels: [] }],
      bindings: { status: 'unbound', totalAcs: 1, boundAcs: 0, symbols: [] },
    });
    const out = formatBindingsCellColored(f, COLORS);
    expect(out).toContain('<D>0<R> TU');
    expect(out).toContain('<Y>1<R> E2E');
    expect(out).toContain('<X>○<R>');
  }
}

void HasBareDescribeOrItTests;
void GlyphForTests;
void FormatRuntimeCellTests;
void FormatBindingsCellTests;
void TraceabilityGlyphTests;
void FormatBindingsCellColoredTests;
