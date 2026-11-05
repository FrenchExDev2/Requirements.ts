/** Stable feature identity shared by implementation and specification packages. */
export interface FeatureReference<Id extends string = string> {
  readonly id: Id;
  readonly deprecated?: boolean;
  readonly replacedBy?: string;
}
/** An intentional retirement preserves the explanation for a formerly published identity. */
export interface FeatureRetirement { readonly reason: string; readonly replacedBy?: string }

/** Rejects silent identity deletion and broken replacements without requiring runtime services. */
export function checkFeatureEvolution(previous: readonly string[], current: readonly FeatureReference[], retirements: Readonly<Record<string,FeatureRetirement>> = {}): readonly string[] {
  const ids=new Set(current.map(feature=>feature.id));
  const errors:string[]=[];
  if(ids.size!==current.length)errors.push('Duplicate feature identity');
  for(const id of previous)if(!ids.has(id)){
    const retirement=retirements[id];
    if(!retirement?.reason.trim())errors.push(`Feature removed without explicit retirement: ${id}`);
    else if(retirement.replacedBy&&!ids.has(retirement.replacedBy))errors.push(`Unknown replacement for ${id}: ${retirement.replacedBy}`);
  }
  for(const feature of current)if(feature.replacedBy&&!ids.has(feature.replacedBy))errors.push(`Unknown replacement for ${feature.id}: ${feature.replacedBy}`);
  return errors;
}

/** Creates an immutable identity; titles and acceptance criteria belong to the specification. */
export function featureReference<const Id extends string>(id: Id): FeatureReference<Id> {
  if (!/^[A-Z][A-Z0-9-]*$/.test(id)) throw new TypeError(`Invalid feature identity: ${id}`);
  return Object.freeze({ id });
}

const participation = new WeakMap<object, readonly FeatureReference[]>();

/**
 * Records declared participation without wrapping the class or method.
 * Uses standard TypeScript decorators; static tooling never executes this decorator.
 * @param features Stable references owned by the business shared kernel.
 */
export function ParticipatesIn(...features: readonly FeatureReference[]) {
  if (!features.length || features.some(feature => !feature || !/^[A-Z][A-Z0-9-]*$/.test(feature.id))) throw new TypeError('ParticipatesIn requires valid feature references.');
  const refs = Object.freeze([...features]);
  return <T extends object>(value: T, context: ClassDecoratorContext | ClassMethodDecoratorContext): void => {
    if (context.kind !== 'class' && context.kind !== 'method') throw new TypeError('ParticipatesIn requires a class or method.');
    participation.set(value, Object.freeze([...(participation.get(value) ?? []), ...refs]));
  };
}

/** Reads declared metadata only; the result does not establish implementation correctness. */
export function getParticipation(value: object): readonly FeatureReference[] {
  return participation.get(value) ?? [];
}
