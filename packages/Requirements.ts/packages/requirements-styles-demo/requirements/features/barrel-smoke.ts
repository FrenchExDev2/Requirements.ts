import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';

@Satisfies(ReqDogFoodRequirement)
export abstract class DemoBarrelSmokeFeature extends Feature {
  readonly id = 'DEMO-BARREL-SMOKE';
  readonly title = '@frenchexdev2/requirements-styles-demo — barrel smoke (Ship 4 placeholder)';
  readonly priority = Priority.High;
  abstract barrelExportsThreeFsms(): ACResult;
  abstract barrelExportsOrchestrator(): ACResult;
  abstract barrelExportsScenarioCommands(): ACResult;
  abstract schemaAndScenariosAreBundled(): ACResult;
}
