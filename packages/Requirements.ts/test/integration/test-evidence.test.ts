import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { QualificationInfrastructureFeature } from '../../packages/requirements-requirements/src/qualification-contracts.js';

@FeatureTest(QualificationInfrastructureFeature)
class ExecutionEvidenceTests {
  @Verifies<QualificationInfrastructureFeature>('matchesIndividualExecutionEvidence')
  async matchesFileClassTestAndPassingExecution() {
    const { evaluateTestEvidence }=await import(new URL('../../scripts/lib/test-evidence.mjs',import.meta.url).href);
    const ref={testFile:'packages/a/test/unit/example.test.ts',className:'ExampleTests',testName:'verifies AC'};
    const report=(status:string,overrides:Record<string,unknown>={})=>({testResults:[{name:'C:/repo/'+ref.testFile,assertionResults:[{title:ref.testName,ancestorTitles:[ref.className],status,...overrides}]}]});
    expect(evaluateTestEvidence([ref],[report('passed')])[0].execution).toBe('passed');
    expect(evaluateTestEvidence([ref],[report('failed')])[0].execution).toBe('failed');
    expect(evaluateTestEvidence([ref],[report('pending')])[0].execution).toBe('skipped');
    expect(evaluateTestEvidence([ref],[report('passed',{ancestorTitles:['OtherTests']})])[0].execution).toBe('missing');
    expect(evaluateTestEvidence([ref],[report('passed',{title:'different AC'})])[0].execution).toBe('missing');
    expect(evaluateTestEvidence([ref],[report('passed'),report('failed')])[0].execution).toBe('failed');
    expect(evaluateTestEvidence([ref],[])[0].execution).toBe('missing');
  }
}
void ExecutionEvidenceTests;
