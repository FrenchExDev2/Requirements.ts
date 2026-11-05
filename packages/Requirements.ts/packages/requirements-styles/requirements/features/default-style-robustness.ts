import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqDogFoodRequirement } from '../requirements/req-dog-food';
import { ReqPropertyInvariantsRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Property-based robustness of the DefaultStyle preset.
 *
 * Three pure functions exposed by `DefaultStyle` (the canonical
 * RequirementStyle bundled with this package) must accept arbitrary
 * runtime input without crashing — validators and reporters operate at
 * the FFI / JSON.parse boundary where data shape is not guaranteed.
 *
 * Tests live in this package (rather than upstream in `requirements-lib`)
 * because the code under test lives here: moving the tests follows the
 * code, eliminating a `empty-targets` cross-package smell that the
 * upstream test-smells scanner previously surfaced.
 */
@Satisfies(
  ReqDogFoodRequirement,
  ReqPropertyInvariantsRequirement,
)
export abstract class DefaultStyleRobustnessFeature extends Feature {
  readonly id = 'DEFAULT-STYLE-ROBUSTNESS';
  readonly title = 'DefaultStyle validators + reporter never crash on reproducible random input';
  readonly priority = Priority.High;

  abstract validateSpecNeverCrashesOnRandomInput(): ACResult;
  abstract validateStatementNeverCrashesOnRandomInput(): ACResult;
  abstract renderStatementNeverCrashesOnRandomInput(): ACResult;
}
