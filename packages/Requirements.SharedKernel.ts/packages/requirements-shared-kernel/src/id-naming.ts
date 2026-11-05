/**
 * Pure ID → name transformations.
 *
 * Shared between spec-io's source generators and core's rename codemod.
 * Lives in core (zero deps) so both tier-1 (spec-io) and core itself can use
 * them without creating cross-tier cycles.
 */

import type { FeatureId, RequirementId } from './types.js';

/** Kebab-case an Id for use as a filename. CART → cart. */
export function kebabOfId(id: string): string {
  return id.toLowerCase();
}

/** Convert a hyphen-separated Id to PascalCase. REQ-DSL → ReqDsl. */
function pascalOfId(id: string): string {
  return id
    .split('-')
    .filter(seg => seg.length > 0)
    .map(seg => {
      const lower = seg.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

/** FeatureId → PascalCase + 'Feature' suffix. CART → CartFeature. */
export function featureClassName(id: FeatureId): string {
  return pascalOfId(id) + 'Feature';
}

/** RequirementId → PascalCase + 'Requirement' suffix. REQ-DSL → ReqDslRequirement. */
export function requirementClassName(id: RequirementId): string {
  return pascalOfId(id) + 'Requirement';
}
