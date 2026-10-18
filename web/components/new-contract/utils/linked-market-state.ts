import type { Contract } from 'common/contract'
import type { MarketDraft } from 'common/drafts'
import dayjs from 'dayjs'
import type { FormState } from '../contextual-editor-panel'

export function getCreateMarketCloseParams(
  state: Pick<
    FormState,
    | 'outcomeType'
    | 'neverCloses'
    | 'closeDate'
    | 'closeHoursMinutes'
    | 'linkedToContractId'
    | 'hasManuallyEditedCloseDate'
  >
): { closeTime?: number; neverCloses?: true } {
  if (state.outcomeType === 'POLL' && state.neverCloses)
    return { neverCloses: true }
  // The displayed parent date is a preview. Let the server copy the current
  // parent deadline under lock unless the creator explicitly chose a date.
  if (state.linkedToContractId && !hasManualCloseTime(state)) return {}
  if (!state.closeDate) return {}
  const closeTime = new Date(
    state.closeDate + 'T' + (state.closeHoursMinutes || '23:59')
  ).getTime()
  if (!Number.isFinite(closeTime))
    throw new Error('Please select a valid close date and time.')
  return { closeTime }
}

export function getCloseTimeFields(closeTime: number | undefined) {
  if (closeTime === undefined || !Number.isFinite(closeTime)) return undefined
  const date = dayjs(closeTime)
  if (!date.isValid()) return undefined
  return {
    closeDate: date.format('YYYY-MM-DD'),
    closeHoursMinutes: date.format('HH:mm'),
    neverCloses: false,
  }
}

export function hasManualCloseTime(
  state: Pick<
    FormState,
    'hasManuallyEditedCloseDate' | 'closeDate' | 'neverCloses'
  >
) {
  // Old local drafts have no flag. Preserve their existing date conservatively.
  return (
    state.hasManuallyEditedCloseDate ?? (!!state.closeDate || state.neverCloses)
  )
}

export function selectLinkedMarket(
  state: FormState,
  link:
    | { contractId: string; relation: NonNullable<FormState['linkRelation']> }
    | undefined
): FormState {
  const clearDefault =
    state.linkedToContractId !== link?.contractId && !hasManualCloseTime(state)
  return {
    ...state,
    linkedToContractId: link?.contractId,
    linkRelation: link?.relation,
    ...(clearDefault
      ? {
          closeDate: undefined,
          closeHoursMinutes: undefined,
          neverCloses: false,
          inheritedCloseTimeFrom: undefined,
        }
      : {}),
  }
}

export function isLinkedCloseTimePending(state: FormState) {
  return (
    !!state.linkedToContractId &&
    !hasManualCloseTime(state) &&
    state.inheritedCloseTimeFrom !== state.linkedToContractId
  )
}

export function getLinkedCloseTimeDescription(state: FormState) {
  if (state.outcomeType === 'POLL' && state.neverCloses) return 'Never'
  if (!state.linkedToContractId || hasManualCloseTime(state)) return undefined
  if (isLinkedCloseTimePending(state))
    return 'Uses linked market deadline (loading…)'
  if (!state.closeDate)
    return state.outcomeType === 'POLL' ? 'Never' : 'Choose a close date'
  return undefined
}

export function applyLinkedMarketCloseTime(
  state: FormState,
  parent: Pick<Contract, 'id' | 'closeTime'>
): FormState {
  const closeTimeFields = getCloseTimeFields(parent.closeTime)
  if (state.linkedToContractId !== parent.id || hasManualCloseTime(state))
    return state
  return {
    ...state,
    closeDate: undefined,
    closeHoursMinutes: undefined,
    neverCloses: false,
    ...closeTimeFields,
    inheritedCloseTimeFrom: parent.id,
  }
}

export function applySuggestedCloseTime(
  state: FormState,
  question: string,
  closeTime: number
): FormState {
  const closeTimeFields = getCloseTimeFields(closeTime)
  if (
    state.question !== question ||
    state.outcomeType === 'POLL' ||
    state.linkedToContractId ||
    hasManualCloseTime(state) ||
    !closeTimeFields
  )
    return state
  return { ...state, ...closeTimeFields }
}

export function restoreMarketDraft(
  state: FormState,
  data: MarketDraft['data']
): FormState {
  return {
    ...state,
    question: data.question,
    description: data.description,
    outcomeType: data.outcomeType,
    answers: data.answers,
    answerProbs: undefined,
    closeDate: data.closeDate,
    closeHoursMinutes: data.closeHoursMinutes,
    inheritedCloseTimeFrom: data.inheritedCloseTimeFrom,
    neverCloses: data.neverCloses ?? false,
    hasManuallyEditedCloseDate:
      data.hasManuallyEditedCloseDate ??
      (!!data.closeDate || !!data.neverCloses),
    // Assign even when absent: an older/unlinked draft must clear a current link.
    linkedToContractId: data.linkedToContractId,
    linkRelation: data.linkRelation,
    visibility: data.visibility,
    selectedGroups: data.selectedGroups,
  }
}
