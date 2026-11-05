import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/**
 * REQ-PROPERTY-INVARIANTS — Pure functions exposed by the package satisfy
 * algebraic invariants verifiable by property + fuzzy testing.
 *
 * Industrial / safety-critical adopters need confidence that smart
 * constructors, generators, and validators behave correctly on the entire
 * input space — not just example fixtures. fast-check exhausts random inputs;
 * any unhandled input class surfaces as a counter-example.
 */
export abstract class ReqPropertyInvariantsRequirement extends Requirement {
  readonly id = 'REQ-PROPERTY-INVARIANTS';
  readonly title = 'Pure functions satisfy algebraic invariants under property + fuzzy testing';
  readonly priority = Priority.High;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'verify every smart constructor, every id-derivation helper, every generator, and every validator against fast-check property tests so that random and adversarial inputs cannot crash the package.',
  };

  readonly rationale = {
    claim: 'Industrial adopters cannot ship a typed DSL whose pure functions might throw on unanticipated inputs; fuzzing surfaces those classes before customers do.',
    kind: 'risk-mitigation' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'JSVerify / fast-check practice in QuickCheck-style libraries',
        rationale: 'Property testing has been the safety-critical bar for ML / Coq / Haskell since 2000; bringing it to the TS DSL closes the QA gap vs hand-picked fixtures.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'every smart constructor satisfies its accept/reject regex property under random ASCII strings',
      binds: ['smartConstructorsAcceptIfAndOnlyIfRegexMatches'] },
    { kind: 'unit-test' as const,
      describes: 'kebabOfId / featureClassName / requirementClassName form an idempotent + reversible ontology',
      binds: ['idHelpersAreIdempotentAndReversible'] },
    { kind: 'unit-test' as const,
      describes: 'specToJson is deterministic and round-trips via JSON.parse',
      binds: ['specToJsonIsDeterministicAndRoundtrips'] },
    { kind: 'unit-test' as const,
      describes: 'random spec inputs to validateSpec never crash; result is always {ok, errors[]}',
      binds: ['validateSpecNeverCrashesOnRandomInput'] },
    { kind: 'unit-test' as const,
      describes: 'diffSpecToDisk: equal proposed vs current → all entries unchanged',
      binds: ['diffOfEqualContentYieldsAllUnchanged'] },
  ];

  readonly verificationMethod = 'Test' as const;
  readonly source = { type: 'stakeholder' as const, role: 'principle/industrial-grade-quality', date: '2026-04-14' };
  readonly risk = {
    level: 'High' as const,
    ifNotMet: 'Adversarial inputs surface in customer environments; un-tested input classes corrupt specs or crash builds.',
  };
}
