import { expect } from 'vitest';
import { describe, it } from 'vitest';
import {
  requirementId,
  featureId,
  acName,
  isoDate,
  sentence,
  percentage,
  ParseError,
  DEFAULT_STATUS_WORKFLOW,
  DEFAULT_RISK_TAXONOMY,
  SCHEMA_VERSION,
} from '../../src/types.js';

describe('smart constructors', () => {
  it('accepts canonical ids and rejects invalid', () => {
    expect(requirementId('REQ-CART')).toBe('REQ-CART');
    expect(() => requirementId('cart')).toThrow(ParseError);
    expect(() => requirementId(1 as unknown as string)).toThrow(ParseError);
    expect(featureId('CART')).toBe('CART');
    expect(() => featureId('cart')).toThrow(ParseError);
    expect(acName('tocClick')).toBe('tocClick');
    expect(() => acName('Toc')).toThrow(ParseError);
    expect(isoDate('2026-04-14')).toBe('2026-04-14');
    expect(() => isoDate('14-04-2026')).toThrow(ParseError);
    expect(sentence('Hello.')).toBe('Hello.');
    expect(() => sentence('Hello')).toThrow(ParseError);
    expect(() => sentence('   ')).toThrow(ParseError);
    expect(percentage(50)).toBe(50);
    expect(() => percentage(101)).toThrow(ParseError);
    expect(() => percentage(Number.NaN)).toThrow(ParseError);
    expect(() => percentage('x' as unknown as number)).toThrow(ParseError);
  });

  it('exposes default workflow and taxonomy constants', () => {
    expect(DEFAULT_STATUS_WORKFLOW.initial).toBeTruthy();
    expect(DEFAULT_RISK_TAXONOMY.levels.length).toBeGreaterThan(0);
    expect(SCHEMA_VERSION).toBe('2026-04-14');
    const err = new ParseError('field', 1, 'bad');
    expect(err.name).toBe('ParseError');
    expect(err.message).toContain('field');
  });
});
