// Some markets don't have a close time. Let's add it.

import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { Contract } from '../../../common/contract'
import { batchedWaitAll } from '../../../common/util/promise'

const firestore = admin.firestore()

async function addCloseTimeToContracts() {
  console.log('Adding close times to existing contracts')

  const contracts = await getValues<Contract>(
    firestore.collection('contracts').where('isResolved', '==', false)
  )

  console.log('Loaded', contracts.length, 'contracts')

  await batchedWaitAll(contracts.map((c) => () => addCloseTimeToContract(c)))
}

async function addCloseTimeToContract(contract: Contract) {
  if (contract.closeTime) {
    return
  }
  const closeTime = closeTimes.get(contract.slug)
  if (!closeTime) {
    console.error('No close time found', contract.slug)
    return
  }
  const contractRef = firestore.doc(`contracts/${contract.id}`)
  await contractRef.update({
    closeTime,
  } as Partial<Contract>)
  console.log('Added close time', contract.slug, new Date(closeTime))
}

const closeTimes = new Map<string, number>([
  ['will-apple-ship-its-ar-glasses-by-e', 1672531200000],
  ['will-ethereum-switch-to-proof-of-st', 1672531200000],
  ['will-mantic-markets-have-over-1m', 1672531200000],
  ['will-aoc-challenge-chuck-schumer-in', 1672531200000],
  ['nancy-pelosi-announces-retirement-p', 1672531200000],
  ['will-activisionblizzard-solve-its-r', 1672531200000],
  ['test', 1656547200000],
  ['will-spacex-become-a-publicly-trade', 1672531200000],
  ['mantic-will-airdrop-crypto-to-early', 1656633600000],
  ['will-the-homicide-rate-in-2022-rema', 1704067200000],
  ['in-us-pandemic-fades-away-to-predel', 1672531200000],
  ['will-we-discover-life-on-mars-befor', 1704067200000],
  ['november-2022-yearonyear-cpi-growth', 1672531200000],
  ['will-2060-globally-be-warmer-than-2', 2871763200000],
  ['will-starship-reach-orbit-by-the-en', 1672531200000],
  ['will-the-runnerup-in-the-2024-us-pr', 1735689600000],
  ['will-joe-rogan-interview-a-guest-ab', 1672531200000],
  ['the-unemployment-rate-stays-between', 1672531200000],
  ['restaurant-and-retail-spending-cont', 1672531200000],
  ['will-at-the-end-of-2022-western-tee', 1672531200000],
  ['will-chinese-economic-growth-drop-b', 1924992000000],
  ['us-authorizes-another-covid-booster', 1672531200000],
  ['will-fbi-statistics-show-homicides-', 1672531200000],
  ['will-dwayne-johnson-win-the-2024-us', 1737331200000],
  ['democrats-go-down-at-least-one-gove', 1672531200000],
  ['will-congress-hold-any-hearings-abo', 1672531200000],
  ['will-there-be-a-2022-sarscov2-varia', 1672531200000],
  ['will-there-be-a-federal-mask-requir', 1667865600000],
  ['no-military-conflict-between-the-pr', 1672531200000],
  ['will-redditcomrslatestarcodex-have-', 1656633600000],
  ['we-will-be-getting-boosters-modifie', 1661990400000],
  ['will-pete-buttigieg-be-the-2024-dem', 1735689600000],
  ['omicron-has-a-100-or-bigger-transmi', 1672531200000],
  ['will-apple-reach-a-market-capitaliz', 1672531200000],
  ['will-the-median-rent-for-a-1bedroom', 1672531200000],
  ['hillary-clinton-signals-in-any-way-', 1735689600000],
  ['will-james-webb-space-telescope-dep', 1659312000000],
  ['fullselfdriving-robotaxis-generally', 1704067200000],
  ['will-circular-economy-become-mainst', 2272147200000],
  ['joe-biden-is-still-president-at-the', 1672531200000],
  ['will-bit-coin-hit-100k-this-year', 1672531200000],
  ['democrats-lose-both-houses-of-congr', 1672531200000],
  ['will-teslas-cybertruck-go-into-full', 1672531200000],
  ['will-the-sp-500-trade-below-3800-in', 1672531200000],
  ['will-chicago-have-more-than-12-inch', 1656547200000],
  ['will-a-major-norwegian-political-pa-58167546884aa', 1672531200000],
  ['will-i-be-a-regular-user-of-this-we', 1672531200000],
  ['will-apple-sell-an-apple-branded-ar', 1669852800000],
  ['at-the-end-of-its-ipo-day-will-redd', 1672531200000],
  ['will-any-major-known-associates-of-', 1672531200000],
  ['will-donald-trump-be-the-republican', 1735689600000],
  ['will-solana-have-a-higher-market-ca', 1672531200000],
  ['will-congress-hold-any-hearings-abo-e21f987033b3', 1672531200000],
  ['will-ethereum-overtake-bitcoin-in-t', 1672531200000],
  ['china-officially-abandons-covid-zer', 1672531200000],
  ['privacy-tokens-will-outgrow-status-', 1672531200000],
  ['republicans-will-win-the-2022-texas', 1669852800000],
  ['will-at-least-75-of-the-usa-covid19', 1677542400000],
  ['liz-cheney-loses-primary-in-2022', 1672531200000],
  ['will-the-us-inflation-rate-for-2022', 1688169600000],
  ['will-republicans-win-enough-seats-i', 1669852800000],
  ['will-the-world-experience-a-solar-s', 1672531200000],
])

if (require.main === module)
  addCloseTimeToContracts().then(() => process.exit())
