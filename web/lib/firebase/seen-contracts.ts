import { mapValues } from 'lodash'

const key = 'feed-seen-contracts'

export const pushSeenContract = (contractId: string) => {
  const newSeenContracts = {
    ...getSeenContracts(),
    [contractId]: Date.now(),
  }
  setSeenContracts(newSeenContracts)
}

export const setSeenContracts = (timestampsById: { [k: string]: number }) => {
  localStorage.setItem(key, JSON.stringify(timestampsById))
}

export const getSeenContracts = () => {
  return mapValues(
    JSON.parse(localStorage.getItem(key) ?? '{}'),
    (time) => +time
  )
}
