import _ from 'lodash'
import { useEffect, useState } from 'react'
import { Fold } from '../../common/fold'
import { User } from '../../common/user'
import {
  listAllFolds,
  listenForFold,
  listenForFolds,
  listenForFoldsWithTags,
  listenForFollow,
  listenForFollowedFolds,
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

export const useFoldsWithTags = (tags: string[] | undefined) => {
  const [folds, setFolds] = useState<Fold[] | undefined>()

  const tagsKey = tags?.join(',')

  useEffect(() => {
    if (tags && tags.length > 0) return listenForFoldsWithTags(tags, setFolds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsKey])

  return folds
}

export const useFollowingFold = (fold: Fold, user: User | null | undefined) => {
  const [following, setFollowing] = useState<boolean | undefined>()

  const foldId = fold?.id
  const userId = user?.id

  useEffect(() => {
    if (userId) return listenForFollow(foldId, userId, setFollowing)
  }, [foldId, userId])

  return following
}

// Note: We cache followedFoldIds in localstorage to speed up the initial load
export const useFollowedFoldIds = (user: User | null | undefined) => {
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

      return listenForFollowedFolds(user.id, (foldIds) => {
        setFollowedFoldIds(foldIds)
        localStorage.setItem(key, JSON.stringify(foldIds))
      })
    }
  }, [user])

  return followedFoldIds
}

// We also cache followedFolds directly in JSON.
// TODO: Extract out localStorage caches to a utility
export const useFollowedFolds = (user: User | null | undefined) => {
  const [followedFolds, setFollowedFolds] = useState<Fold[] | undefined>()
  const ids = useFollowedFoldIds(user)

  useEffect(() => {
    if (user && ids) {
      const key = `followed-full-folds-${user.id}`
      const followedFoldJson = localStorage.getItem(key)
      if (followedFoldJson) {
        setFollowedFolds(JSON.parse(followedFoldJson))
        // Exit early if ids and followedFoldIds have all the same elements.
        if (
          _.isEqual(
            _.sortBy(ids),
            _.sortBy(JSON.parse(followedFoldJson).map((f: Fold) => f.id))
          )
        ) {
          return
        }
      }

      // Otherwise, fetch the full contents of all folds
      listAllFolds().then((folds) => {
        const followedFolds = folds.filter((fold) => ids.includes(fold.id))
        setFollowedFolds(followedFolds)
        localStorage.setItem(key, JSON.stringify(followedFolds))
      })
    }
  }, [user, ids])

  return followedFolds
}
