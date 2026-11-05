// Reuse the existing contract assertions and instrument spec-io's source via
// its Vitest aliases. requirements-lib keeps testing the public compiled exports.
import '../../../requirements-lib/test/unit/spec-to-source.test';
import '../../../requirements-lib/test/unit/spec-from-source.test';
import '../../../requirements-lib/test/unit/schema-generate.test';
import '../../../requirements-lib/test/unit/schema-register.test';
import '../../../requirements-lib/test/unit/bidi-sync-core.test';
import '../../../requirements-lib/test/unit/coverage-closure.test.js';
