import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { QualificationFeature } from '../../../requirements-requirements/src/qualification-contracts.js';
import { buildQualificationInventory, inspectQualificationTests, hasQualificationRuntime } from '../../src/qualification-inventory.js';

const contract = `
export abstract class ValueRequirement extends Requirement {
 readonly id='REQ-VALUE'; readonly status='Draft';
 readonly fitCriteria=[{kind:'unit-test',binds:['accepts']}];
}
@Satisfies(ValueRequirement)
export abstract class ValueFeature extends Feature {
 readonly id='VALUE'; readonly enabled=false;
 abstract accepts(): ACResult; // expects: unit, e2e
}
`;

@FeatureTest(QualificationFeature)
class QualificationInventoryTests {
  @Verifies<QualificationFeature>('discoversCanonicalContractsWithoutExecuting')
  resolvesNamedNamespaceDefaultAndForwardedWorkspaceImports() {
    const sources = [
      { file: 'spec/value.ts', text: contract },
      { file: 'packages/value/package.json', text: JSON.stringify({ name: '@fixture/value', exports: { '.': { import: './dist/index.js' }, './default': { default: './dist/default.js' }, './direct': './dist/value.js', './arrow': './dist/arrow.js', './absent': './dist/absent.js', './none': {} } }) },
      { file: 'packages/value/src/index.ts', text: `export * from './cycle.js'; export { works as accepts, constant } from './value.js'; export { type T } from './value.js'; export type * from './value.js'; export * from './absent.js'; export * as inner from './value.js';` },
      { file: 'packages/value/src/cycle.ts', text: `export * from './index.js';` },
      { file: 'packages/value/src/value.ts', text: `export function works(value: number) {return value>0} export class Checker {} export enum Choice { First } export const constant=1; export const {field}={field:1}; export interface T {} function localOnly(){}` },
      { file: 'packages/value/src/shim.ts', text: `export { works } from './value.js';` },
      { file: 'packages/value/src/default.ts', text: `export default function () { return 1; }` },
      { file: 'packages/value/src/arrow.ts', text: `export default () => 1;` },
      { file: 'metadata/package.json', text: '{}' },
      { file: 'other/package.json', text: '{"name":"@fixture/empty"}' },
      { file: 'test/unit/value.test.ts', text: `
import { accepts } from '@fixture/value';
import * as values from '@fixture/value/direct';
import option from '@fixture/value/default';
import arrow from '@fixture/value/arrow';
import * as arrowSpace from '@fixture/value/arrow';
import directDefault from '@fixture/value/direct';
import { missingExport } from '@fixture/value';
import { absent } from '@fixture/value/absent';
import { works as relativeWorks } from '../../packages/value/src/value.js';
import { works as throughShim } from '../../packages/value/src/shim.js';
import type { T } from '@fixture/value/direct';
import { type T as OtherType, constant } from '@fixture/value/direct';
import { missing } from 'external';
export default class {}
@FeatureTest(ValueFeature) class ValueTests {
 readonly value=1;
 constructor() {}
 @Verifies('accepts') "accepts"() { expect(accepts(1)).toBe(true); expect(values.constant).toBe(constant); expect(option()).toBe(arrow()); expect(relativeWorks(1)).toBe(throughShim(1)); expect(arrowSpace.default()).toBe(1); }
 @Verifies('accepts') ignoredImport() { expect(absent()).toBe(missingExport()); expect(directDefault()).toBe(1); }
}
` },
      { file: 'test/unit/proxy.test.ts', text: `import './value.test.js';` },
    ];
    const inventory = buildQualificationInventory(sources, '/fixture');
    expect(inventory.tests[0]!.targets).toEqual(expect.arrayContaining(['packages/value/src/value.ts', 'packages/value/src/default.ts', 'packages/value/src/arrow.ts']));
    expect(inventory.tests[1]!.targets).toEqual([]);
    expect(inventory.testAliases).toEqual({ 'test/unit/proxy.test.ts': ['test/unit/value.test.ts'] });
    expect(inventory.diagnostics).toEqual([]);
  }

  @Verifies<QualificationFeature>('discoversCanonicalContractsWithoutExecuting')
  inventoriesEveryClassAndPreservesDisabledContracts() {
    const inventory = buildQualificationInventory([
      { file: 'spec/value.ts', text: contract },
      { file: 'src/value.ts', text: 'export function accepts(value: number) { return value > 0; }' },
      { file: 'package.json', text: '{"type":"module"}' },
      { file: 'src/types.d.ts', text: 'export interface OnlyType { value: string }' },
    ], '/repo');
    expect(inventory.requirements).toEqual([{ id: 'REQ-VALUE', className: 'ValueRequirement', file: 'spec/value.ts', status: 'Draft', refines: [], criteria: [{ id: 'REQ-VALUE:fit:1', kind: 'unit-test', binds: ['accepts'] }] }]);
    expect(inventory.features[0]!.enabled).toBe(false);
    expect(inventory.features[0]!.acs).toEqual([{ name: 'accepts', levels: ['unit', 'e2e'] }]);
    expect(inventory.executableFiles).toEqual(['src/value.ts']);
    expect(inventory.exclusions).toEqual([{ file: 'src/types.d.ts', reason: 'declaration-only' }]);
    expect(Object.keys(inventory.hashes)).toHaveLength(4);
    expect(inventory.hashes['package.json']).toMatch(/^[a-f0-9]{64}$/);
    expect(buildQualificationInventory([{ file: 'first.ts', text: contract }, { file: 'second.ts', text: contract }], '/repo').diagnostics.filter(d => d.code === 'duplicate-contract')).toHaveLength(2);
  }

  @Verifies<QualificationFeature>('discoversCanonicalContractsWithoutExecuting')
  distinguishesRuntimeDeclarationsFromErasedTypesAndReexports() {
    for (const text of ['export interface A {}', 'export type A = string;', 'export * from "./value.js";', 'import { A } from "a"; export { A };', ';']) expect(hasQualificationRuntime({ file: 'src/value.ts', text })).toBe(false);
    for (const text of ['export const value = 1;', 'export default () => 1;', 'export abstract class A { readonly value=1; }', 'console.log("runtime")']) expect(hasQualificationRuntime({ file: 'src/value.ts', text })).toBe(true);
    expect(hasQualificationRuntime({ file: 'types.d.ts', text: 'declare const value: number;' })).toBe(false);
      for (const extension of ['mts', 'cts']) {
        const file = `src/types.d.${extension}`;
        expect(hasQualificationRuntime({ file, text: 'declare const value: number;' })).toBe(false);
        expect(buildQualificationInventory([{ file, text: 'declare const value: number;' }], '/repo').exclusions).toEqual([{ file, reason: 'declaration-only' }]);
      }
      for (const extension of ['mts', 'cts', 'jsx', 'tsx']) {
        const file = `src/runtime.${extension}`;
        expect(buildQualificationInventory([{ file, text: 'export const value = 1;' }], '/repo').executableFiles).toEqual([file]);
      }
    expect(buildQualificationInventory([{ file: 'src/types.ts', text: 'export interface OnlyType {}' }], '/repo').exclusions).toEqual([{ file: 'src/types.ts', reason: 'no-own-runtime-statements' }]);
    const unsupported = buildQualificationInventory([{ file: 'spec.ts', text: `export abstract class R extends Requirement {readonly id='REQ-R'; readonly fitCriteria=[{kind:'inspection'}, 'invalid', {kind: someExpression}];}` }], '/repo');
    expect(unsupported.requirements[0]!.criteria.map(c => c.kind)).toEqual(['inspection', 'unknown', 'unknown']);
    expect(buildQualificationInventory([{ file: 'a.ts', text: 'export abstract class R extends Requirement {}' }], '/repo').requirements[0]!.criteria).toEqual([]);
    expect(buildQualificationInventory([{ file: 'a.ts', text: 'export abstract class R extends Requirement { readonly fitCriteria = runtime(); }' }], '/repo').requirements[0]!.criteria).toEqual([]);
  }

  @Verifies<QualificationFeature>('inspectsAliasedTestRegistration')
  catchesAliasesNamespacesParameterizedAndSkippedRegistrations() {
    for (const text of [
      'it("example", () => {});', 'test.skip("example", () => {});',
      'describe.each([1])("example", () => {});',
      'import { it as check } from "vitest"; check("example", () => {});',
      'import * as v from "vitest"; v.test.each([1])("example", () => {});',
      'import * as v from "vitest"; v["it"]("example", () => {});',
      'import * as v from "vitest"; const check=v.it; check("example", () => {});',
      'import * as v from "vitest"; const check=v["test"]; check("example", () => {});',
      'import * as v from "vitest"; const {it: check}=v; check("example", () => {});',
      'import * as v from "vitest"; const {test: check}=v; check.each`value ${1}`("example", () => {});',
      'import * as v from "vitest"; const {"test": check}=v; check("example", () => {});',
      'import * as v from "vitest"; const {test, it:{call: nested}, [Symbol.iterator]: dynamic}=v; it("example", () => {});',
      'import * as v from "vitest"; const {custom}=v; const {test: renamed}=unknown; const {other}=it; it("example", () => {});',
      'const setup=() => 1; const unknown=setup(); const ignored=42; (it)("example", () => {});',
      'const check=it.skip; check("example", () => {});',
      'const check=it["skip"]; check("example", () => {});',
      'it["skip"]("example", () => {});',
      'const unused=unknown.value; const other=unknown["value"]; it("example", () => {});',
      'import { test as first } from "vitest"; const second=first; const third=second; third.skip("example", () => {});',
      'const a=b; const b=a; suite("example", () => {});',
    ]) expect(inspectQualificationTests({ file: 'test/unit/fixture.test.ts', text }, '/repo').diagnostics.some(d => d.code === 'bare-test-registration'), text).toBe(true);
    expect(inspectQualificationTests({ file: 'test/unit/fixture.test.ts', text: 'const fixture = `it("not executed")`; // describe("comment")' }, '/repo').diagnostics.map(d => d.code)).toEqual(['unregistered-test-file']);
    const aliasedFeature = inspectQualificationTests({ file: 'test/unit/alias.test.ts', text: `import {ValueFeature as Value} from 'contracts'; @FeatureTest(Value) class T { @Verifies<Value>('accepts') accepts(){expect(true).toBe(true)} }` }, '/repo');
    expect(aliasedFeature.tests[0]!.feature).toBe('ValueFeature');
    expect(aliasedFeature.diagnostics).toEqual([]);
    const namespace = inspectQualificationTests({ file: 'test/unit/namespace.test.ts', text: `import * as C from 'contracts'; @FeatureTest(C.ValueFeature) class T { @Verifies<C.ValueFeature>('accepts') accepts(){expect(true).toBe(true)} }` }, '/repo');
    expect(namespace.tests[0]!.feature).toBe('ValueFeature');
    expect(namespace.diagnostics).toEqual([]);
    const mismatch = inspectQualificationTests({ file: 'test/unit/mismatch.test.ts', text: `@FeatureTest(ValueFeature) class T { @Verifies<OtherFeature>('accepts') accepts(){expect(true).toBe(true)} }` }, '/repo');
    expect(mismatch.diagnostics.map(d => d.code)).toContain('mismatched-verifies-feature');
    for (const argumentsText of ['', 'runtimeName', "'accepts', 'ignoredAtRuntime'"]) {
      const invalid = inspectQualificationTests({ file: 'test/unit/invalid.test.ts', text: `@FeatureTest(ValueFeature) class T { @Verifies<ValueFeature>(${argumentsText}) accepts(){expect(true).toBe(true)} }` }, '/repo');
      expect(invalid.tests).toEqual([]);
      expect(invalid.diagnostics.map(diagnostic => diagnostic.code)).toContain('invalid-verifies-argument');
    }
  }

  @Verifies<QualificationFeature>('requiresCompleteCoverage')
  refusesExecutableSuppressionDirectivesButPreservesLiteralFixtures() {
    const texts = ['/* v8 ignore next */ export const value=1;', '// istanbul ignore file\nexport function value(){return 1}', '// Stryker disable all\nexport const value=1;', '/* c8 ignore start */ export const value=1;', 'export const re=/["\']/; /* v8 ignore next */ export const value=1;'];
    for (const text of texts) expect(buildQualificationInventory([{ file: 'src/value.ts', text }], '/repo').diagnostics.map(d => d.code)).toContain('suppressed-executable-code');
    expect(buildQualificationInventory([{ file: 'src/value.ts', text: 'export const value="/* v8 ignore next */";' }], '/repo').diagnostics).toEqual([]);
    expect(buildQualificationInventory([{ file: 'src/value.ts', text: '/** Documents the words v8 ignore without suppressing behavior. */ export const value=1;' }], '/repo').diagnostics).toEqual([]);
    expect(buildQualificationInventory([{ file: 'src/value.ts', text: 'export const example=`/* v8 ignore next */`; export const slash=/\/\//;' }], '/repo').diagnostics).toEqual([]);
    const noAssertion = inspectQualificationTests({ file: 'test/unit/value.test.ts', text: '@FeatureTest(ValueFeature) class T { @Verifies("accepts") accepts(){void expect;} }' }, '/repo');
    expect(noAssertion.tests[0]!.hasAssertion).toBe(false);
  }

  @Verifies<QualificationFeature>('inspectsAliasedTestRegistration')
  refusesDynamicTestNamesAndMissingForwardedSources() {
    const dynamic = inspectQualificationTests({ file: 'test/unit/dynamic.test.ts', text: `class Undecorated {} @FeatureTest() class MissingFeature { @Verifies('accepts') accepts(){expect(true).toBe(true)} @Verifies('accepts') [dynamicName](){expect(true).toBe(true)} }` }, '/fixture');
    expect(dynamic.tests[0]!.feature).toBe('');
    expect(dynamic.diagnostics.map(d => d.code)).toContain('dynamic-test-name');
    const missing = buildQualificationInventory([{ file: 'test/unit/proxy.test.ts', text: `import './absent.test.js';` }], '/fixture');
    expect(missing.diagnostics.map(d => d.code)).toContain('unresolved-test-forward');
    expect(inspectQualificationTests({ file: 'test/unit/bare-decorator.test.ts', text: '@FeatureTest class Invalid {}' }, '/fixture').diagnostics.map(d => d.code)).toContain('unregistered-test-file');
    for (const text of ['null', '[]', '1', '{invalid']) expect(buildQualificationInventory([{ file: 'package.json', text }], '/fixture').diagnostics.map(d => d.code)).toContain('invalid-package-manifest');
  }

  @Verifies<QualificationFeature>('rejectsUnboundOrAssertionlessTests')
  inventoriesDecoratedTestsAndFlagsUndecoratedMethods() {
    const text = `
import { expect } from 'vitest';
import { accepts } from '../../src/value.js';
function check() { expect(accepts(1)).toBe(true); }
@FeatureTest(ValueFeature)
class ValueTests {
 @Verifies<ValueFeature>('accepts') 'with helper'() { check(); }
 @Verifies<ValueFeature>('accepts') empty() {}
 @Verifies<ValueFeature>('accepts') abstract noBody(): void;
 @TypeCheckOnly() @Verifies<ValueFeature>('accepts') types() { expect(true).toBe(true); }
 @Exclude() helper() {}
 undeclared() { expect(1).toBe(1); }
}
`;
    const result = inspectQualificationTests({ file: 'test/unit/value.test.ts', text }, '/repo');
    expect(result.diagnostics.map(d => d.code)).toEqual(['undecorated-test']);
    expect(result.tests.map(t => [t.name, t.hasAssertion, t.strategy])).toEqual([['with helper', true, 'example'], ['empty', false, 'example'], ['noBody', false, 'example'], ['types', true, 'type']]);
    expect(result.tests[0]!.targets).toContain('src/value.ts');
    expect(inspectQualificationTests({ file: 'test/unit/property.test.ts', text }, '/repo').tests[0]!.strategy).toBe('property');
    expect(inspectQualificationTests({ file: 'test/unit/fuzz.test.ts', text }, '/repo').tests[0]!.strategy).toBe('fuzz');
    const alias = inspectQualificationTests({ file: 'test/integration/alias.test.ts', text: `import {FeatureTest as FT, Verifies as V} from 'dsl'; @FT(ValueFeature) class T { @V('accepts') accepts() { expect(true).toBe(true); } }` }, '/repo');
    expect(alias.tests[0]!.feature).toBe('ValueFeature');
    expect(alias.tests[0]!.level).toBe('integration');
    expect(inspectQualificationTests({ file: 'root.test.ts', text }, '/repo').tests[0]!.level).toBe('unit');
  }
}
void QualificationInventoryTests;
