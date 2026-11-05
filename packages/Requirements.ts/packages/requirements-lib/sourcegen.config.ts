import { defineConfig, PackageBarrelGenerator } from '@frenchexdev2/ts-codegen-pipeline';

/**
 * Auto-generate the mechanical bulk re-exports of `src/index.ts`.
 *
 * The hand-written `src/index.ts` keeps:
 *   - external re-exports from @frenchexdev2/requirements-core
 *   - selective re-exports from ./types, ./analysis/index, ./spec-from-source,
 *     ./versioning (where collisions or comments matter)
 *   - the `./scaffolders/index` subdirectory barrel
 *   - and ends with `export * from './index.generated.js';` for the rest.
 *
 * Excluded from auto-generation: modules whose hand-written index uses
 * SELECTIVE re-exports (avoiding identifier collisions documented in
 * the original index.ts comments).
 */
export default defineConfig({
  tsconfigPath: './tsconfig.json',
  consumerPackageRoot: import.meta.dirname,
  outDir: 'src',
  generators: [
    new PackageBarrelGenerator({
      srcDir: 'src',
      recursive: false,
      exclude: ['types', 'spec-from-source', 'versioning'],
    }),
  ],
});
