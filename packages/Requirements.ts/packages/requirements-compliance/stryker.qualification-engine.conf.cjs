/** Diagnostic campaign for the verdict engine. Final qualification uses the root campaign. */
const preset = require('../../stryker.preset.cjs');
module.exports = preset({ mutate: ['src/qualification.ts'], ignoreStatic: false, incremental: false });
