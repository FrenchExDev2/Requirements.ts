import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';

@Satisfies(ReqDogFoodRequirement)
export abstract class LibBarrelSmokeFeature extends Feature {
  readonly id = 'LIB-BARREL-SMOKE';
  readonly title = '@frenchexdev2/requirements-lib — barrel smoke (Ship 2 placeholder)';
  readonly priority = Priority.High;
  abstract barrelExportsCoreKernel(): ACResult;
  abstract barrelExportsSpecDtos(): ACResult;
  abstract barrelExportsAnalysisSurface(): ACResult;
  abstract schemasAreBundled(): ACResult;
}
