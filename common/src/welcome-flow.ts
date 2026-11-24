import { uniqBy } from 'lodash'

import { getDisplayProbability } from './calculate'
import type { BinaryContract, Contract } from './contract'
import { HOUR_MS } from './util/time'

export const getWelcomeSteps = ({
  onContractPage,
  hasPendingBet,
  inSignedOutBetTest,
}: {
  onContractPage: boolean
  hasPendingBet: boolean
  inSignedOutBetTest: boolean
}): ('intro' | 'first-bet')[] =>
  onContractPage || hasPendingBet || inSignedOutBetTest
    ? ['intro']
    : ['intro', 'first-bet']

export const isPermanentReferralError = (code: number) =>
  code === 400 || code === 403 || code === 404

// A 25-character username can have a five-character nanoid suffix.
export const normalizeReferrerInput = (raw: string) =>
  raw
    .trim()
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 30)

// Called after the name is saved or on a later visit. Creator attribution
// stays on the original welcome routes and waits for onboarding to finish.
export const shouldSendCachedReferral = (args: {
  explicit?: boolean
  onImplicitReferralPage: boolean
  pastOnboarding: boolean
}) =>
  args.explicit === true || (args.onImplicitReferralPage && args.pastOnboarding)

export function pickFirstBetMarkets(
  contracts: Contract[],
  now: number,
  limit = 3,
  minTraders = 10
): BinaryContract[] {
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(limit) ||
    limit < 1 ||
    !Number.isFinite(minTraders) ||
    minTraders < 0
  )
    return []

  const eligible = contracts.filter((contract): contract is BinaryContract => {
    if (
      contract.outcomeType !== 'BINARY' ||
      contract.mechanism !== 'cpmm-1' ||
      contract.token !== 'MANA' ||
      contract.visibility !== 'public' ||
      contract.isResolved ||
      contract.deleted ||
      (contract.closeTime !== undefined &&
        (!Number.isFinite(contract.closeTime) ||
          contract.closeTime <= now + HOUR_MS)) ||
      !Number.isFinite(contract.uniqueBettorCount) ||
      contract.uniqueBettorCount < minTraders
    )
      return false
    const probability = getDisplayProbability(contract)
    return (
      Number.isFinite(probability) && probability >= 0.1 && probability <= 0.9
    )
  })
  return uniqBy(eligible, 'id').slice(0, limit)
}
