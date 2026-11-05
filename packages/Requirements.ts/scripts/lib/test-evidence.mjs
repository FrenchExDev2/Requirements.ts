/** Match an AST declaration to an individual runner result without inferring success. */
export function evaluateTestEvidence(refs, reports) {
  return refs.map(ref => {
    const matches=reports.flatMap(report=>report.testResults??[])
      .filter(suite=>suite.name.replaceAll('\\','/').endsWith('/'+ref.testFile))
      .flatMap(suite=>suite.assertionResults??[])
      .filter(test=>test.title===ref.testName&&(test.ancestorTitles??[]).includes(ref.className));
    const status=matches.some(test=>test.status==='failed')?'failed':matches.some(test=>test.status==='passed')?'passed':matches.length?'skipped':'missing';
    return {...ref,execution:status};
  });
}
