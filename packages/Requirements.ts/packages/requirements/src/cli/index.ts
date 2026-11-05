// @frenchexdev2/requirements/cli
export {
  buildTraceIndex,
  normalizePath,
  queryFileToFeatures,
  queryFeatureToFiles,
  queryFileToTests,
  queryFeatureToTests,
  queryImpact,
  queryHotspots,
  queryFragile,
  queryGaps,
  queryMatrix,
  queryChain,
  renderFileToFeatures,
  renderFeatureToFiles,
  renderFileToTests,
  renderFeatureToTests,
  renderImpact,
  renderHotspots,
  renderFragile,
  renderGaps,
  renderMatrix,
  renderChain,
} from '@frenchexdev2/requirements-trace';
export type {
  TraceIndex,
  TraceFormatter,
  GapReport,
  MatrixResult,
  ChainResult,
  ImpactResult,
} from '@frenchexdev2/requirements-trace';

export { buildScaffoldResult, findUncoveredACs, generateUnitTestStub, generateE2eTestStub } from '@frenchexdev2/requirements-scaffolders';
export type { ScaffoldResult, UncoveredAC } from '@frenchexdev2/requirements-scaffolders';
