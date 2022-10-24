export enum ResolutionOutcome {
  YES = 'YES',
  NO = 'NO',
  PROB = 'MKT',
  CANCEL = 'CANCEL',
}

export function getOutcomeForString(s: string): ResolutionOutcome {
  if (!s) return undefined;
  s = s.toLocaleUpperCase();
  let outcome = ResolutionOutcome[s];
  if (s === 'NA' || s === 'N/A') {
    outcome = ResolutionOutcome.CANCEL;
  }
  return outcome;
}

export function test_getOutcomeForString() {
  console.assert(getOutcomeForString('yes') === ResolutionOutcome.YES, 'yes === YES');
  console.assert(getOutcomeForString('NO') === ResolutionOutcome.NO, 'NO === NO');
  console.assert(getOutcomeForString('N/a') === ResolutionOutcome.CANCEL, 'N/a === CANCEL');
}
