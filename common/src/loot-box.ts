import { clamp, shuffle } from 'lodash'

import { BinaryContract } from './contract'
import { User } from './user'
import { Bet } from './bet'
import { noFees } from './fees'
import { getProbability } from './calculate'

export const LOOTBOX_COST = 501
export const LOOTBOX_MAX = 5000
const LOOTBOX_MEAN = 350
const LOOTBOX_MIN = 25

export interface LootBoxItem {
  contract: BinaryContract
  outcome: 'YES' | 'NO'
  amount: number
  shares: number
}

export type LootBox = LootBoxItem[]

export const createLootBox = (contracts: BinaryContract[]): LootBox => {
  const boxValue = clamp(
    Math.round(customLogNormalSample(LOOTBOX_MEAN, LOOTBOX_MAX)),
    LOOTBOX_MIN,
    LOOTBOX_MAX
  )

  const n = boxValue < 50 ? 1 : Math.ceil(Math.random() * 4)

  const selectedContracts = shuffle(contracts).slice(0, n)
  const weights = generateWeights(n)

  const box = selectedContracts.map((contract, i) => {
    const outcome: 'YES' | 'NO' = Math.random() > 0.5 ? 'YES' : 'NO'
    const amount = Math.round(weights[i] * boxValue)
    const prob = getProbability(contract)
    const shares = outcome === 'YES' ? amount / prob : amount / (1 - prob)

    return { contract, outcome, amount, shares }
  })

  return box
}

function logNormalSample(mu: number, sigma: number) {
  const u1 = Math.random()
  const u2 = Math.random()
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
  return Math.exp(mu + sigma * z0)
}

function customLogNormalSample(mean: number, targetMax: number) {
  const mu = Math.log(mean) - 0.5 * Math.log(1 + (targetMax - mean) / mean)
  const sigma = Math.sqrt(Math.log(1 + (targetMax - mean) / mean))
  return logNormalSample(mu, sigma)
}

function generateWeights(n: number) {
  const randomProbabilities = new Array(n)
  let remainingProb = 1

  for (let i = 0; i < n - 1; i++) {
    randomProbabilities[i] =
      remainingProb * clamp(Math.random(), 1 / (2 * n), 2 / n)
    remainingProb -= randomProbabilities[i]
  }

  randomProbabilities[n - 1] = remainingProb

  return shuffle(randomProbabilities)
}

export const createLootBet = (
  user: User,
  contract: BinaryContract,
  outcome: 'YES' | 'NO',
  prob: number,
  amount: number,
  shares: number
): Omit<Bet, 'id'> => {
  return {
    createdTime: Date.now(),
    userId: user.id,
    userAvatarUrl: user.avatarUrl,
    userUsername: user.username,
    userName: user.name,
    amount: amount,
    shares,
    isFilled: true,
    isCancelled: false,
    contractId: contract.id,
    outcome,
    probBefore: prob,
    probAfter: prob,
    loanAmount: 0,
    fees: noFees,
    isAnte: false,
    isRedemption: false,
    isChallenge: true,
    visibility: contract.visibility,
  }
}
