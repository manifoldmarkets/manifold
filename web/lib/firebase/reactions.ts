import {
  collection,
  deleteDoc,
  doc,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { removeUndefinedProps } from 'common/util/object'
import { User } from 'common/user'
import { track } from '../service/analytics'
import { Reaction, ReactionContentTypes, ReactionTypes } from 'common/reaction'
import { Contract } from 'common/contract'
import { getValues } from 'web/lib/firebase/utils'

function getReactsCollection(userId: string) {
  return collection(db, 'users', userId, 'reactions')
}

export const unReact = async (
  userId: string,
  contentId: string,
  contentType: ReactionContentTypes,
  reactionType: ReactionTypes
) => {
  const reacts = await getValues<Reaction>(
    query(
      getReactsCollection(userId),
      where('contentId', '==', contentId),
      where('contentType', '==', contentType),
      where('type', '==', reactionType)
    )
  )
  if (reacts.length > 0) {
    await deleteDoc(doc(getReactsCollection(userId), reacts[0].id))
  }
}

export const react = async (
  user: User,
  contentId: string,
  contentOwnerId: string,
  contentType: string,
  contract: Contract,
  title: string,
  text: string,
  type: ReactionTypes,
  eventProperties?: any
) => {
  // i.e. commentId-like
  const id = `${contentId}-${type}`
  const ref = doc(getReactsCollection(user.id), id)
  const contentParentId =
    contentType === 'contract' ? contentOwnerId : contract.id
  const slug =
    `/${contract.creatorUsername}/${contract.slug}` +
    (contentType === 'comment' ? `#${contentId}` : '')
  const reaction = removeUndefinedProps({
    id: ref.id,
    contentId,
    userId: user.id,
    createdTime: Date.now(),
    contentType: contentType,
    contentParentId,
    contentOwnerId: contentOwnerId,
    type,
    userUsername: user.username,
    userAvatarUrl: user.avatarUrl,
    userDisplayName: user.name,
    slug,
    title,
    text,
  } as Reaction)

  track('like', {
    itemId: contentId,
    ...eventProperties,
  })

  await setDoc(ref, reaction)
}
