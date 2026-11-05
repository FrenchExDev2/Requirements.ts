import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

export abstract class ReqEditorFirstClassRequirement extends Requirement {
  readonly id = 'REQ-EDITOR-FIRST-CLASS';
  readonly title = 'Hand-editing a .spec.json must feel native — autocomplete, validation, docs, zero config';
  readonly priority = Priority.High;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'a user opens a .spec.json file in a JSON-aware editor',
    response: 'surface autocomplete, validation, and inline documentation for every field, with zero manual configuration beyond installing the package.',
  };

  readonly rationale = {
    claim: 'If hand-editing the spec requires reading docs, the JSON-as-source-of-truth promise is broken.',
    kind: 'principle' as const,
    evidence: [],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const, describes: 'schema generator produces ajv-valid JSON Schema',
      binds: ['generateSchemaProducesValidJsonSchema'] },
    { kind: 'unit-test' as const, describes: 'every generated .spec.json has $schema as its first key',
      binds: ['wizardEmitsSchemaKeyInGeneratedSpecJson'] },
    { kind: 'unit-test' as const, describes: 'schema register merges into .vscode/settings.json non-destructively',
      binds: ['registerCommandMergesIntoExistingSettings'] },
  ];

  readonly verificationMethod = 'Test' as const;
  readonly source = { type: 'stakeholder' as const, role: 'principle/spec-as-code', date: '2026-04-14' };
  readonly risk = { level: 'High' as const, ifNotMet: 'Users cannot hand-edit specs reliably; adoption of --replay and --sync workflows stalls.' };
}
