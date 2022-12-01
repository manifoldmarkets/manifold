import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { removeUndefinedProps } from 'common/util/object'
import { User } from 'common/user'
import { track } from '../service/analytics'
import { Reaction } from 'common/reaction'
import { Contract } from 'common/contract'

function getReactsCollection(userId: string) {
  return collection(db, 'users', userId, 'reactions')
}

export const unReact = async (userId: string, itemId: string) => {
  const ref = await doc(getReactsCollection(userId), itemId)
  return await deleteDoc(ref)
}

export const react = async (
  user: User,
  contentId: string,
  contentOwnerId: string,
  contentType: string,
  contract: Contract,
  title: string,
  text: string
) => {
  // create new like in db under users collection
  const ref = doc(getReactsCollection(user.id), contentId)
  const contentParentId =
    contentType === 'contract' ? contentOwnerId : contract.id
  const slug =
    `/${contract.creatorUsername}/${contract.slug}` +
    (contentType === 'comment' ? `#${contentId}` : '')
  // contract slug and question are set via trigger
  const reaction = removeUndefinedProps({
    id: ref.id,
    userId: user.id,
    createdTime: Date.now(),
    contentType: contentType,
    contentParentId,
    contentOwnerId: contentOwnerId,
    type: 'like',
    userUsername: user.username,
    userAvatarUrl: user.avatarUrl,
    userDisplayName: user.name,
    slug,
    title,
    text,
  } as Reaction)
  track('like', {
    itemId: contentId,
  })
  await setDoc(ref, reaction)
}
