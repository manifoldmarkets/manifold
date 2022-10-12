import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getAllUsers, getValues } from '../utils'
import { Contract } from 'common/contract'
import {
  MarketCreatorBadge,
  marketCreatorBadgeRarityThresholds,
  StreakerBadge,
  streakerBadgeRarityThresholds,
} from 'common/badge'
import { User } from 'common/user'
initAdmin()

const firestore = admin.firestore()

async function main() {
  const users = await getAllUsers()
  // const users = filterDefined([await getUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')]) // dev ian
  // const users = filterDefined([await getUser('uglwf3YKOZNGjjEXKc5HampOFRE2')]) // prod David
  // const users = filterDefined([await getUser('AJwLWoo3xue32XIiAVrL5SyR1WB2')]) // prod ian
  await Promise.all(
    users.map(async (user) => {
      if (!user.id) return
      // Only backfill users without achievements
      if (user.achievements === undefined) {
        await firestore.collection('users').doc(user.id).update({
          achievements: {},
        })
        user.achievements = {}
        user.achievements = await awardMarketCreatorBadges(user)
        user.achievements = await awardBettingStreakBadges(user)
        console.log('Added achievements to user', user.id)
        // going to ignore backfilling the proven correct badges for now
      } else {
        // Make corrections to existing achievements
        await awardMarketCreatorBadges(user)
      }
    })
  )
}

if (require.main === module) main().then(() => process.exit())

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function removeErrorBadges(user: User) {
  if (
    user.achievements.streaker?.badges.some(
      (b) => b.data.totalBettingStreak > 1
    )
  ) {
    console.log(
      `User ${
        user.id
      } has a streaker badge with streaks ${user.achievements.streaker?.badges.map(
        (b) => b.data.totalBettingStreak
      )}`
    )
    // delete non 1,50 streaks
    user.achievements.streaker.badges =
      user.achievements.streaker.badges.filter((b) =>
        streakerBadgeRarityThresholds.includes(b.data.totalBettingStreak)
      )
    // update user
    await firestore.collection('users').doc(user.id).update({
      achievements: user.achievements,
    })
  }
}

async function awardMarketCreatorBadges(user: User) {
  // Award market maker badges
  const contracts = (
    await getValues<Contract>(
      firestore.collection(`contracts`).where('creatorId', '==', user.id)
    )
  ).filter((c) => !c.resolution || c.resolution != 'CANCEL')

  const achievements = {
    ...user.achievements,
    marketCreator: {
      badges: [...(user.achievements.marketCreator?.badges ?? [])],
    },
  }
  for (const threshold of marketCreatorBadgeRarityThresholds) {
    const alreadyHasBadge = user.achievements.marketCreator?.badges.some(
      (b) => b.data.totalContractsCreated === threshold
    )
    if (alreadyHasBadge) continue
    if (contracts.length >= threshold) {
      console.log(`User ${user.id} has at least ${threshold} contracts`)
      const badge = {
        type: 'MARKET_CREATOR',
        name: 'Market Creator',
        data: {
          totalContractsCreated: threshold,
        },
        createdTime: Date.now(),
      } as MarketCreatorBadge
      achievements.marketCreator.badges.push(badge)
    }
  }
  // update user
  await firestore.collection('users').doc(user.id).update({
    achievements,
  })
  return achievements
}

async function awardBettingStreakBadges(user: User) {
  const streak = user.currentBettingStreak ?? 0
  const achievements = {
    ...user.achievements,
    streaker: {
      badges: [...(user.achievements?.streaker?.badges ?? [])],
    },
  }
  for (const threshold of streakerBadgeRarityThresholds) {
    if (streak >= threshold) {
      const badge = {
        type: 'STREAKER',
        name: 'Streaker',
        data: {
          totalBettingStreak: threshold,
        },
        createdTime: Date.now(),
      } as StreakerBadge
      achievements.streaker.badges.push(badge)
    }
  }
  // update user
  await firestore.collection('users').doc(user.id).update({
    achievements,
  })
  return achievements
}
