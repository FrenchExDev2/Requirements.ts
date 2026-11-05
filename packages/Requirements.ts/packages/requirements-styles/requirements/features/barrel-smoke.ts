import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';

@Satisfies(ReqDogFoodRequirement)
export abstract class StylesBarrelSmokeFeature extends Feature {
  readonly id = 'STYLES-BARREL-SMOKE';
  readonly title = '@frenchexdev2/requirements-styles — barrel smoke (Ship 3 placeholder)';
  readonly priority = Priority.High;
  abstract barrelExportsFivePresets(): ACResult;
  abstract barrelExportsRegistry(): ACResult;
  abstract presetsAreDistinct(): ACResult;
}
