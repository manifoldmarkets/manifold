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
  itemId: string,
  itemCreatorId: string,
  itemType: string,
  contract: Contract,
  text: string
) => {
  // create new like in db under users collection
  const ref = doc(getReactsCollection(user.id), itemId)
  // contract slug and question are set via trigger
  const reaction = removeUndefinedProps({
    id: ref.id,
    userId: user.id,
    createdTime: Date.now(),
    onType: itemType,
    type: 'like',
    userUsername: user.username,
    userAvatarUrl: user.avatarUrl,
    userDisplayName: user.name,
    slug:
      contract.creatorUsername + '/' + contract.slug + itemType === 'comment'
        ? `#${itemId}`
        : '',
    text,
  } as Reaction)
  track('like', {
    itemId,
  })
  await setDoc(ref, reaction)
}
