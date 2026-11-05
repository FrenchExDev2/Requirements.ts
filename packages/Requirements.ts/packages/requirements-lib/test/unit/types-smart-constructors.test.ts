/**
 * Tests for the parse-don't-validate smart constructors in src/cli/types.ts.
 * Dog-fooded on SmartConstructorsFeature — one @Verifies per AC.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '../../src';
import { SmartConstructorsFeature } from '@frenchexdev2/requirements-requirements';
import {
  requirementId,
  featureId,
  acName,
  isoDate,
  sentence,
  percentage,
  ParseError,
} from '@frenchexdev2/requirements-core/types';

@FeatureTest(SmartConstructorsFeature)
class SmartConstructorsTests {
  @Verifies<SmartConstructorsFeature>('requirementIdAcceptsCanonicalForm')
  'requirementId accepts REQ-ALPHA, REQ-CART-PERSIST, REQ-DSL-COMPLETE'() {
    expect(requirementId('REQ-ALPHA')).toBe('REQ-ALPHA');
    expect(requirementId('REQ-CART-PERSIST')).toBe('REQ-CART-PERSIST');
    expect(requirementId('REQ-DSL-COMPLETE')).toBe('REQ-DSL-COMPLETE');
    // Boundary cases — quantifier `*` after first letter, digits in segments, many short segments.
    expect(requirementId('REQ-A')).toBe('REQ-A');               // single-char first segment
    expect(requirementId('REQ-A0')).toBe('REQ-A0');             // digit in first segment after the letter
    expect(requirementId('REQ-A-B-C-D')).toBe('REQ-A-B-C-D');   // many one-char trailing segments
    expect(requirementId('REQ-ALPHA-1-X')).toBe('REQ-ALPHA-1-X'); // digit-only trailing segment
  }

  @Verifies<SmartConstructorsFeature>('requirementIdRejectsMalformed')
  'requirementId rejects lowercase / missing prefix / empty / boundary violations'() {
    expect(() => requirementId('req-foo')).toThrow(ParseError);
    expect(() => requirementId('FOO')).toThrow(ParseError);
    expect(() => requirementId('')).toThrow(ParseError);
    expect(() => requirementId('REQ-1')).toThrow(ParseError);   // first segment must start with letter
    // Anchor boundaries — pattern is /^REQ-...$/.
    expect(() => requirementId('XREQ-FOO')).toThrow(ParseError);    // prefix before REQ → ^ anchor
    expect(() => requirementId('REQ-FOO bar')).toThrow(ParseError); // trailing chars → $ anchor
    expect(() => requirementId('REQ-FOO\n')).toThrow(ParseError);   // trailing newline → $ anchor (no /m flag)
    // Character-class boundaries.
    expect(() => requirementId('REQ-0FOO')).toThrow(ParseError);    // first segment must start with [A-Z], not digit
    expect(() => requirementId('REQ-fo_o')).toThrow(ParseError);    // underscore not in [A-Z0-9]
    expect(() => requirementId('REQ-FO_O')).toThrow(ParseError);    // underscore in upper segment
    // Segment-shape boundaries.
    expect(() => requirementId('REQ-')).toThrow(ParseError);        // empty first segment
    expect(() => requirementId('REQ-FOO-')).toThrow(ParseError);    // trailing dash → empty last segment
  }

  @Verifies<SmartConstructorsFeature>('featureIdAcceptsCanonicalForm')
  'featureId accepts CART, USER-AUTH, FOO-BAR-BAZ'() {
    expect(featureId('CART')).toBe('CART');
    expect(featureId('USER-AUTH')).toBe('USER-AUTH');
    expect(featureId('FOO-BAR-BAZ')).toBe('FOO-BAR-BAZ');
    // Boundary cases — single-letter id, alphanumeric, many short segments.
    expect(featureId('A')).toBe('A');                   // single-char id (quantifier `*` = 0)
    expect(featureId('A0')).toBe('A0');                 // digit in id after the letter
    expect(featureId('A-B-C-D')).toBe('A-B-C-D');       // many one-char segments
    expect(featureId('FOO-1-X')).toBe('FOO-1-X');       // digit-only trailing segment
  }

  @Verifies<SmartConstructorsFeature>('featureIdRejectsMalformed')
  'featureId rejects lowercase / starts-with-digit / empty / boundary violations'() {
    expect(() => featureId('cart')).toThrow(ParseError);
    expect(() => featureId('1CART')).toThrow(ParseError);
    expect(() => featureId('')).toThrow(ParseError);
    // Anchor boundaries — pattern is /^[A-Z]...$/.
    expect(() => featureId('XCART YO')).toThrow(ParseError);  // trailing chars → $ anchor
    expect(() => featureId(' CART')).toThrow(ParseError);     // leading whitespace → ^ anchor
    expect(() => featureId('CART\n')).toThrow(ParseError);    // trailing newline → $ anchor (no /m flag)
    // Character-class + segment-shape boundaries.
    expect(() => featureId('CA_RT')).toThrow(ParseError);     // underscore not in [A-Z0-9]
    expect(() => featureId('-CART')).toThrow(ParseError);     // leading dash
    expect(() => featureId('CART-')).toThrow(ParseError);     // trailing dash
    expect(() => featureId('CART--FOO')).toThrow(ParseError); // empty middle segment
  }

  @Verifies<SmartConstructorsFeature>('acNameAcceptsCamelCase')
  'acName accepts addItemIncreasesCount, emptyCart, a'() {
    expect(acName('addItemIncreasesCount')).toBe('addItemIncreasesCount');
    expect(acName('emptyCart')).toBe('emptyCart');
    expect(acName('a')).toBe('a');
    // Boundary cases — alphanumeric mix after first letter.
    expect(acName('aB')).toBe('aB');             // single uppercase second char
    expect(acName('a1')).toBe('a1');             // digit second char
    expect(acName('a1B2c3')).toBe('a1B2c3');     // alternating
  }

  @Verifies<SmartConstructorsFeature>('acNameRejectsNonCamelCase')
  'acName rejects PascalCase / snake_case / kebab-case / empty / boundary violations'() {
    expect(() => acName('AddItem')).toThrow(ParseError);
    expect(() => acName('add_item')).toThrow(ParseError);
    expect(() => acName('add-item')).toThrow(ParseError);
    expect(() => acName('')).toThrow(ParseError);
    // Anchor boundaries — pattern is /^[a-z][a-zA-Z0-9]*$/.
    expect(() => acName(' add')).toThrow(ParseError);    // leading whitespace → ^ anchor
    expect(() => acName('add\n')).toThrow(ParseError);   // trailing newline → $ anchor (no /m flag)
    // Character-class boundaries.
    expect(() => acName('1abc')).toThrow(ParseError);    // first char must be [a-z], not digit
    expect(() => acName('add item')).toThrow(ParseError);// space not in [a-zA-Z0-9]
    expect(() => acName('add.item')).toThrow(ParseError);// dot not in [a-zA-Z0-9]
  }

  @Verifies<SmartConstructorsFeature>('isoDateAcceptsDateOnlyAndFullDatetime')
  'isoDate accepts YYYY-MM-DD and full datetime forms'() {
    expect(isoDate('2026-04-14')).toBe('2026-04-14');
    expect(isoDate('2026-04-14T09:12:04Z')).toBe('2026-04-14T09:12:04Z');
    expect(isoDate('2026-04-14T09:12:04.123Z')).toBe('2026-04-14T09:12:04.123Z');
    expect(isoDate('2026-04-14T09:12:04+02:00')).toBe('2026-04-14T09:12:04+02:00');
    // Boundary cases — negative offset, milliseconds with explicit offset.
    expect(isoDate('2026-04-14T09:12:04-05:00')).toBe('2026-04-14T09:12:04-05:00');
    expect(isoDate('2026-04-14T09:12:04.987-05:00')).toBe('2026-04-14T09:12:04.987-05:00');
  }

  @Verifies<SmartConstructorsFeature>('isoDateRejectsMalformed')
  'isoDate rejects DD/MM/YYYY / natural language / empty / boundary violations'() {
    expect(() => isoDate('14/04/2026')).toThrow(ParseError);
    expect(() => isoDate('April 14, 2026')).toThrow(ParseError);
    expect(() => isoDate('')).toThrow(ParseError);
    // Anchor boundaries — pattern is /^\d{4}-\d{2}-\d{2}...$/.
    expect(() => isoDate('X2026-04-14')).toThrow(ParseError);   // prefix → ^ anchor
    expect(() => isoDate('2026-04-14 trailing')).toThrow(ParseError); // suffix → $ anchor
    expect(() => isoDate('2026-04-14\n')).toThrow(ParseError);  // trailing newline → $ anchor
    // Digit-count boundaries — \d{4}-\d{2}-\d{2}.
    expect(() => isoDate('202-04-14')).toThrow(ParseError);     // year 3 digits, not 4
    expect(() => isoDate('2026-4-14')).toThrow(ParseError);     // month 1 digit, not 2
    expect(() => isoDate('2026-04-1')).toThrow(ParseError);     // day 1 digit, not 2
    // \D-vs-\d boundaries — character class.
    expect(() => isoDate('20XX-04-14')).toThrow(ParseError);    // letters in year
    expect(() => isoDate('2026-XX-14')).toThrow(ParseError);    // letters in month
    // Datetime tail boundaries — when present, timezone is required (?:Z|[+-]\d{2}:\d{2}).
    expect(() => isoDate('2026-04-14T09:12:04')).toThrow(ParseError);     // no timezone
    expect(() => isoDate('2026-04-14T09:12:04*02:00')).toThrow(ParseError); // bad tz sign
    expect(() => isoDate('2026-04-14T09:12:04+02:0')).toThrow(ParseError);  // tz minutes 1 digit
    expect(() => isoDate('2026-04-14T9:12:04Z')).toThrow(ParseError);     // hour 1 digit
  }

  @Verifies<SmartConstructorsFeature>('sentenceTrimsAndAcceptsTerminator')
  'sentence trims whitespace and accepts . ! ? terminators'() {
    expect(sentence('Hello.')).toBe('Hello.');
    expect(sentence('  Hello.  ')).toBe('Hello.');
    expect(sentence('Wait!')).toBe('Wait!');
    expect(sentence('Really?')).toBe('Really?');
  }

  @Verifies<SmartConstructorsFeature>('sentenceRejectsEmpty')
  'sentence rejects empty and whitespace-only input'() {
    expect(() => sentence('')).toThrow(ParseError);
    expect(() => sentence('   ')).toThrow(ParseError);
  }

  @Verifies<SmartConstructorsFeature>('sentenceRejectsMissingTerminator')
  'sentence rejects input without a terminating punctuation'() {
    expect(() => sentence('Hello')).toThrow(ParseError);
    expect(() => sentence('Hello,')).toThrow(ParseError);
  }

  @Verifies<SmartConstructorsFeature>('percentageAcceptsZeroToHundred')
  'percentage accepts 0, 50, 100 and fractional values in range'() {
    expect(percentage(0)).toBe(0);
    expect(percentage(50)).toBe(50);
    expect(percentage(100)).toBe(100);
    expect(percentage(99.5)).toBe(99.5);
  }

  @Verifies<SmartConstructorsFeature>('percentageRejectsOutOfRange')
  'percentage rejects negative and >100 values'() {
    expect(() => percentage(-1)).toThrow(ParseError);
    expect(() => percentage(100.01)).toThrow(ParseError);
    expect(() => percentage(1000)).toThrow(ParseError);
  }

  @Verifies<SmartConstructorsFeature>('percentageRejectsNonFinite')
  'percentage rejects NaN and Infinity'() {
    expect(() => percentage(NaN)).toThrow(ParseError);
    expect(() => percentage(Infinity)).toThrow(ParseError);
    expect(() => percentage(-Infinity)).toThrow(ParseError);
  }

  @Verifies<SmartConstructorsFeature>('parseErrorCarriesFieldAndValue')
  'ParseError exposes the offending field + value on its instance'() {
    try {
      requirementId('nope');
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as ParseError;
      expect(err).toBeInstanceOf(ParseError);
      expect(err.field).toBe('RequirementId');
      expect(err.value).toBe('nope');
      expect(err.message).toContain('nope');
    }
  }

  @Verifies<SmartConstructorsFeature>('parseErrorNameIsParseError')
  'ParseError.name is the string "ParseError" (for serialisation / logging)'() {
    const err = new ParseError('f', 42, 'boom');
    expect(err.name).toBe('ParseError');
  }

  @Verifies<SmartConstructorsFeature>('stringConstructorsThrowParseErrorOnNonStringRuntimeInput')
  'string smart constructors throw ParseError (not TypeError) on non-string runtime inputs'() {
    // Simulate runtime callers bypassing TypeScript (JSON deserialize, FFI, dynamic imports).
    const garbage: unknown[] = [null, undefined, 42, true, [], {}, Symbol('x'), new Date()];
    const ctors: ReadonlyArray<readonly [string, (s: string) => unknown]> = [
      ['requirementId', requirementId],
      ['featureId', featureId],
      ['acName', acName],
      ['isoDate', isoDate],
      ['sentence', sentence],
    ];
    for (const [name, ctor] of ctors) {
      for (const g of garbage) {
        let caught: unknown;
        try { ctor(g as string); } catch (e) { caught = e; }
        expect(caught, `${name}(${String(g)})`).toBeInstanceOf(ParseError);
        expect((caught as ParseError).message).toContain('must be a string');
      }
    }
  }

  @Verifies<SmartConstructorsFeature>('percentageThrowsParseErrorOnNonNumberRuntimeInput')
  'percentage throws ParseError (not TypeError) on non-number runtime inputs'() {
    const garbage: unknown[] = [null, undefined, 'fifty', true, [], {}, Symbol('x'), new Date()];
    for (const g of garbage) {
      let caught: unknown;
      try { percentage(g as number); } catch (e) { caught = e; }
      expect(caught, `percentage(${String(g)})`).toBeInstanceOf(ParseError);
      expect((caught as ParseError).message).toContain('must be a number');
    }
  }
}

void SmartConstructorsTests;
