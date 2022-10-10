import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getUser, getValues } from '../utils'
import { Contract } from 'common/contract'
import {
  MarketCreatorBadge,
  marketCreatorBadgeRarityThresholds,
  StreakerBadge,
  streakerBadgeRarityThresholds,
} from 'common/badge'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
initAdmin()

const firestore = admin.firestore()

async function main() {
  // const users = await getAllUsers()
  // const users = filterDefined([await getUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')])
  const users = filterDefined([await getUser('AJwLWoo3xue32XIiAVrL5SyR1WB2')])
  await Promise.all(
    users.map(async (user) => {
      console.log('Added achievements to user', user.id)
      if (!user.id) return
      if (user.achievements === undefined) {
        await firestore.collection('users').doc(user.id).update({
          achievements: {},
        })
        user.achievements = {}
      }
      user.achievements = await awardMarketCreatorBadges(user)
      user.achievements = await awardBettingStreakBadges(user)
      // going to ignore backfilling the proven correct badges for now
    })
  )
}

if (require.main === module) main().then(() => process.exit())

async function awardMarketCreatorBadges(user: User) {
  // Award market maker badges
  const contracts = await getValues<Contract>(
    firestore
      .collection(`contracts`)
      .where('creatorId', '==', user.id)
      .where('resolution', '!=', 'CANCEL')
  )

  const achievements = {
    ...user.achievements,
    marketCreator: {
      badges: [...(user.achievements.marketCreator?.badges ?? [])],
    },
  }
  for (const threshold of marketCreatorBadgeRarityThresholds) {
    if (contracts.length >= threshold) {
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
