import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqEditorFirstClassRequirement } from './req-editor-first-class.js';
import { ReqSpecIsSourceOfTruthRequirement } from './req-spec-is-source-of-truth.js';
import { ReqParallelDeliverableRequirement } from './req-parallel-deliverable.js';
import { ReqDogFoodRequirement } from './req-dog-food.js';

/**
 * Self-Feature for the `requirements schema register` command + schema generation.
 * Owned by Stream E (schema + register).
 */
@Satisfies(
  ReqEditorFirstClassRequirement,        // primary
  ReqSpecIsSourceOfTruthRequirement,     // joint: ajv validates spec pre-write
  ReqParallelDeliverableRequirement,     // joint
  ReqDogFoodRequirement,                 // joint
)
export abstract class FeatureSchemaCommandFeature extends Feature {
  readonly id = 'FEATURE-SCHEMA-COMMAND';
  readonly title = '`requirements schema register` — JSON Schema generation + VS Code binding';
  readonly priority = Priority.Medium;

  // ── Schema generation ──
  abstract generateSchemaProducesValidJsonSchema(): ACResult;
  abstract schemaCoversAllSpecFields(): ACResult;
  abstract schemaEnumsMatchPriorityAndTestLevelAndRequirementKind(): ACResult;

  // ── $schema key in generated specs ──
  abstract wizardEmitsSchemaKeyInGeneratedSpecJson(): ACResult;

  // ── register command ──
  abstract registerCommandWritesVscodeSettings(): ACResult;
  abstract registerCommandMergesIntoExistingSettings(): ACResult;
  abstract registerCommandRefusesConflictWithoutForce(): ACResult;
  abstract printFlagOnlyPrintsSnippet(): ACResult;

  // ── Pre-write validation ──
  abstract validateSpecAgainstSchemaRejectsMalformed(): ACResult;
}
