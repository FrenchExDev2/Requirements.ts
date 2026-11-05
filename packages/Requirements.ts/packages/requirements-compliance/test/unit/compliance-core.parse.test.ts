import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ComplianceCoreFeature } from '@frenchexdev2/requirements-requirements';
import { parseFeatureSource } from '../../src/compliance-core';

const FILE = 'fixture.ts';

@FeatureTest(ComplianceCoreFeature)
class ParseFeatureSourceTests {
  @Verifies<ComplianceCoreFeature>('parsesAbstractExportedFeatureClass')
  'parses an abstract exported class extending Feature'() {
    const src = `
import { Feature, Priority } from './base';
export abstract class MyFeature extends Feature {
  readonly id = 'MY';
  readonly title = 'My';
  readonly priority = Priority.High;
  abstract foo(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta).not.toBeNull();
    expect(meta!.className).toBe('MyFeature');
    expect(meta!.id).toBe('MY');
    expect(meta!.title).toBe('My');
    expect(meta!.priority).toBe('high');
    expect(meta!.acMethods).toEqual(['foo']);
    expect(meta!.enabled).toBe(true);
    expect(meta!.file).toBe(FILE);
  }

  @Verifies<ComplianceCoreFeature>('parsesIdAndTitleFromStringLiterals')
  'falls back to className when id/title properties are missing'() {
    const src = `
export abstract class BareFeature extends Feature {
  abstract noop(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.id).toBe('BareFeature');
    expect(meta!.title).toBe('BareFeature');
    expect(meta!.priority).toBe('medium');
  }

  @Verifies<ComplianceCoreFeature>('parsesPriorityFromEnumPropertyAccess')
  'reads priority from a Priority.X property access expression'() {
    const src = `
export abstract class P extends Feature {
  readonly priority = Priority.Critical;
  abstract noop(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.priority).toBe('critical');
  }

  @Verifies<ComplianceCoreFeature>('parsesEnabledFalseLiteral')
  'detects enabled = false literal'() {
    const src = `
export abstract class D extends Feature {
  readonly enabled = false;
  abstract noop(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.enabled).toBe(false);
  }

  @Verifies<ComplianceCoreFeature>('parsesEnabledFalseLiteral')
  'leaves enabled true when not declared'() {
    const src = `
export abstract class E extends Feature {
  abstract noop(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.enabled).toBe(true);
  }

  @Verifies<ComplianceCoreFeature>('collectsAbstractMethodNamesAsAcs')
  'collects multiple abstract method names in declaration order'() {
    const src = `
export abstract class M extends Feature {
  abstract first(): unknown;
  abstract second(): unknown;
  abstract third(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acMethods).toEqual(['first', 'second', 'third']);
  }

  @Verifies<ComplianceCoreFeature>('readsExpectsDecoratorEnumArguments')
  'reads @Expects(TestLevel.X, ...) enum arguments'() {
    const src = `
export abstract class X extends Feature {
  @Expects(TestLevel.EndToEnd, TestLevel.Accessibility)
  abstract a(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acDetails[0]!.expectedLevels).toEqual(['e2e', 'a11y']);
  }

  @Verifies<ComplianceCoreFeature>('readsExpectsDecoratorStringLiteralArguments')
  'reads @Expects(\'unit\', \'visual\') string-literal arguments'() {
    const src = `
export abstract class Y extends Feature {
  @Expects('functional', 'visual')
  abstract b(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acDetails[0]!.expectedLevels).toEqual(['functional', 'visual']);
  }

  @Verifies<ComplianceCoreFeature>('defaultsToUnitLevelWhenNoExpects')
  'defaults to [unit] when no @Expects decorator'() {
    const src = `
export abstract class Z extends Feature {
  abstract c(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acDetails[0]!.expectedLevels).toEqual(['unit']);
  }

  @Verifies<ComplianceCoreFeature>('ignoresExpectsDecoratorWithUnknownLevels')
  'ignores @Expects with unknown levels and falls back to [unit]'() {
    const src = `
export abstract class W extends Feature {
  @Expects(TestLevel.Bogus, 'invalid')
  abstract d(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acDetails[0]!.expectedLevels).toEqual(['unit']);
  }

  @Verifies<ComplianceCoreFeature>('ignoresExpectsDecoratorWithUnknownLevels')
  'ignores non-@Expects decorators on abstract methods'() {
    const src = `
export abstract class W2 extends Feature {
  @SomeOther(TestLevel.Unit)
  abstract e(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acDetails[0]!.expectedLevels).toEqual(['unit']);
  }

  @Verifies<ComplianceCoreFeature>('ignoresExpectsDecoratorWithUnknownLevels')
  'ignores @Expects when called as identifier (not call expression)'() {
    const src = `
export abstract class W3 extends Feature {
  @Expects
  abstract f(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acDetails[0]!.expectedLevels).toEqual(['unit']);
  }

  @Verifies<ComplianceCoreFeature>('unwrapsAsExpressionsOnInitializers')
  'unwraps `value as const` on id/title initializers'() {
    const src = `
export abstract class U extends Feature {
  readonly id = 'WRAPPED' as const;
  readonly title = 'T' as string;
  readonly priority = Priority.Low as Priority;
  abstract g(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.id).toBe('WRAPPED');
    expect(meta!.title).toBe('T');
    expect(meta!.priority).toBe('low');
  }

  @Verifies<ComplianceCoreFeature>('unwrapsAsExpressionsOnInitializers')
  'unwraps legacy <T>value type assertion'() {
    const src = `
export abstract class U2 extends Feature {
  readonly id = <string>'CAST';
  abstract g(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.id).toBe('CAST');
  }

  @Verifies<ComplianceCoreFeature>('returnsNullForConcreteClass')
  'returns null for a concrete (non-abstract) class'() {
    const src = `
export class NotAbstract extends Feature {
  abstract h(): unknown;
}
`;
    expect(parseFeatureSource(src, FILE)).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('returnsNullForNonExportedClass')
  'returns null for a non-exported abstract class'() {
    const src = `
abstract class NotExported extends Feature {
  abstract i(): unknown;
}
`;
    expect(parseFeatureSource(src, FILE)).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('returnsNullForClassNotExtendingFeature')
  'returns null for a class not extending Feature'() {
    const src = `
export abstract class NotAFeature extends SomethingElse {
  abstract j(): unknown;
}
`;
    expect(parseFeatureSource(src, FILE)).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('returnsNullForClassNotExtendingFeature')
  'returns null for a class with no heritage clause'() {
    const src = `
export abstract class NoHeritage {
  abstract k(): unknown;
}
`;
    expect(parseFeatureSource(src, FILE)).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('returnsNullForClassNotExtendingFeature')
  'returns null for class with implements but not extends Feature'() {
    const src = `
export abstract class OnlyImpl implements ISomething {
  abstract l(): unknown;
}
`;
    expect(parseFeatureSource(src, FILE)).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('returnsNullWhenNoFeatureClassFound')
  'returns null when source contains no class declarations'() {
    expect(parseFeatureSource('export const x = 1;', FILE)).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('returnsNullWhenNoFeatureClassFound')
  'returns null when class has no name'() {
    const src = `export default abstract class extends Feature { abstract m(): unknown; }`;
    expect(parseFeatureSource(src, FILE)).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('ignoresNonClassDeclarations')
  'skips non-class statements (interfaces, type aliases, vars)'() {
    const src = `
export interface I { x: number }
export type T = number;
export const v = 1;
export abstract class Real extends Feature {
  abstract n(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.className).toBe('Real');
  }

  @Verifies<ComplianceCoreFeature>('ignoresPropertiesWithNonStringInitializers')
  'ignores property declarations without initializers'() {
    const src = `
export abstract class NoInit extends Feature {
  readonly id;
  abstract o(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.id).toBe('NoInit');
  }

  @Verifies<ComplianceCoreFeature>('ignoresPropertiesWithNonStringInitializers')
  'ignores id/title properties initialized with non-string-literal values'() {
    const src = `
export abstract class NonString extends Feature {
  readonly id = someComputed();
  readonly title = 42;
  readonly priority = "string-not-enum";
  readonly enabled = true;
  abstract p(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.id).toBe('NonString');
    expect(meta!.title).toBe('NonString');
    expect(meta!.priority).toBe('medium');
    expect(meta!.enabled).toBe(true);
  }

  @Verifies<ComplianceCoreFeature>('ignoresPropertiesWithNonStringInitializers')
  'ignores property declarations with computed names'() {
    const src = `
export abstract class Computed extends Feature {
  readonly ['id'] = 'computed-name-skipped';
  abstract q(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.id).toBe('Computed');
  }

  @Verifies<ComplianceCoreFeature>('collectsAbstractMethodNamesAsAcs')
  'ignores non-abstract methods'() {
    const src = `
export abstract class HasConcrete extends Feature {
  abstract abstractAc(): unknown;
  helper(): void { }
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acMethods).toEqual(['abstractAc']);
  }

  @Verifies<ComplianceCoreFeature>('returnsNullForNonExportedClass')
  'returns null for a bare class declaration with no modifiers at all'() {
    const src = `class NoMods extends Feature { abstract bare(): unknown; }`;
    expect(parseFeatureSource(src, FILE)).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('readsExpectsDecoratorEnumArguments')
  'reads @Expects on a method that also has another decorator'() {
    const src = `
export abstract class MultiDec extends Feature {
  @SomethingElse()
  @Expects(TestLevel.Visual)
  abstract dec(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acDetails[0]!.expectedLevels).toEqual(['visual']);
  }

  @Verifies<ComplianceCoreFeature>('collectsAbstractMethodNamesAsAcs')
  'ignores abstract methods with computed names'() {
    const src = `
export abstract class CompMethod extends Feature {
  abstract ['computed'](): unknown;
  abstract real(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.acMethods).toEqual(['real']);
  }

  @Verifies<ComplianceCoreFeature>('readsSatisfiesDecoratorArgumentsAsClassNames')
  'reads @Satisfies(Req1, Req2) identifier arguments into the satisfies field'() {
    const src = `
@Satisfies(ReqOne, ReqTwo)
export abstract class SatFeature extends Feature {
  abstract noop(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.satisfies).toEqual(['ReqOne', 'ReqTwo']);
  }

  @Verifies<ComplianceCoreFeature>('returnsEmptySatisfiesWhenDecoratorsButNoSatisfies')
  'returns [] when class has decorators but none is @Satisfies'() {
    const src = `
@SomethingElse()
export abstract class OtherDecFeature extends Feature {
  abstract noop(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.satisfies).toEqual([]);
  }

  @Verifies<ComplianceCoreFeature>('returnsEmptySatisfiesWhenDecoratorsButNoSatisfies')
  'skips decorators that are not call expressions'() {
    const src = `
@NotACall
@Satisfies(ReqOne)
export abstract class MixedDecFeature extends Feature {
  abstract noop(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.satisfies).toEqual(['ReqOne']);
  }

  @Verifies<ComplianceCoreFeature>('readsSatisfiesDecoratorArgumentsAsClassNames')
  'ignores @Satisfies arguments that are not plain identifiers'() {
    const src = `
@Satisfies('stringLiteral', ReqTwo)
export abstract class NonIdArgFeature extends Feature {
  abstract noop(): unknown;
}
`;
    const meta = parseFeatureSource(src, FILE);
    expect(meta!.satisfies).toEqual(['ReqTwo']);
  }
}

void ParseFeatureSourceTests;
