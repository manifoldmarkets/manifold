import { useEffect, useState } from 'react'
import { Fold } from '../../common/fold'
import { User } from '../../common/user'
import {
  getFollowedFolds,
  listenForFold,
  listenForFolds,
  listenForFollow,
} from '../lib/firebase/folds'

export const useFold = (foldId: string | undefined) => {
  const [fold, setFold] = useState<Fold | null | undefined>()

  useEffect(() => {
    if (foldId) return listenForFold(foldId, setFold)
  }, [foldId])

  return fold
}

export const useFolds = () => {
  const [folds, setFolds] = useState<Fold[] | undefined>()

  useEffect(() => {
    return listenForFolds(setFolds)
  }, [])

  return folds
}

export const useFollowingFold = (fold: Fold, user: User | null | undefined) => {
  const [following, setFollowing] = useState<boolean | undefined>()

  useEffect(() => {
    if (user) return listenForFollow(fold, user, setFollowing)
  }, [fold, user])

  return following
}

export const useFollowedFolds = (user: User | null | undefined) => {
  const [followedFoldIds, setFollowedFoldIds] = useState<string[] | undefined>(
    undefined
  )

  useEffect(() => {
    if (user) {
      const key = `followed-folds-${user.id}`
      const followedFoldJson = localStorage.getItem(key)
      if (followedFoldJson) {
        setFollowedFoldIds(JSON.parse(followedFoldJson))
      }

      getFollowedFolds(user.id).then((foldIds) => {
        setFollowedFoldIds(foldIds)
        localStorage.setItem(key, JSON.stringify(foldIds))
      })
    }
  }, [user])

  return followedFoldIds
}
