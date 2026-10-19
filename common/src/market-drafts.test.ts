import { API } from './api/schema'

describe('linked market drafts', () => {
  const data = {
    question: 'Will the team score three goals?',
    outcomeType: 'BINARY',
    answers: [],
    closeDate: '2026-10-15',
    closeHoursMinutes: '01:30',
    visibility: 'public',
    selectedGroups: [],
    savedAt: 1,
  }

  it('retains the link and explicit close-time intent through API validation', () => {
    const linkedDraft = {
      ...data,
      linkedToContractId: 'game',
      linkRelation: 'prop',
      hasManuallyEditedCloseDate: true,
      neverCloses: false,
    }
    expect(
      API['save-market-draft'].props.parse({ data: linkedDraft }).data
    ).toEqual(linkedDraft)
  })

  it('retains an inherited deadline marker without turning it into an override', () => {
    const inheritedDraft = {
      ...data,
      linkedToContractId: 'game',
      inheritedCloseTimeFrom: 'game',
      hasManuallyEditedCloseDate: false,
    }
    expect(
      API['save-market-draft'].props.parse({ data: inheritedDraft }).data
    ).toEqual(inheritedDraft)
  })

  it('still accepts drafts saved before links existed', () => {
    expect(API['save-market-draft'].props.parse({ data }).data).toEqual(data)
  })

  it('rejects an unsupported relation instead of saving an uncreatable draft', () => {
    expect(() =>
      API['save-market-draft'].props.parse({
        data: { ...data, linkedToContractId: 'game', linkRelation: 'unknown' },
      })
    ).toThrow()
  })
})
