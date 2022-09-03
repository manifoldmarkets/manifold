import {
  Query,
  collection,
  collectionGroup,
  doc,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore'

import { getValues, listenForValues } from './utils'
import { db } from './init'
import { User } from 'common/user'
import { Comment, ContractComment, GroupComment } from 'common/comment'
import { removeUndefinedProps } from 'common/util/object'
import { track } from '@amplitude/analytics-browser'
import { JSONContent } from '@tiptap/react'

export type { Comment }

export const MAX_COMMENT_LENGTH = 10000

export async function createCommentOnContract(
  contractId: string,
  content: JSONContent,
  commenter: User,
  betId?: string,
  answerOutcome?: string,
  replyToCommentId?: string
) {
  const ref = betId
    ? doc(getCommentsCollection(contractId), betId)
    : doc(getCommentsCollection(contractId))
  // contract slug and question are set via trigger
  const comment = removeUndefinedProps({
    id: ref.id,
    commentType: 'contract',
    contractId,
    userId: commenter.id,
    content: content,
    createdTime: Date.now(),
    userName: commenter.name,
    userUsername: commenter.username,
    userAvatarUrl: commenter.avatarUrl,
    betId: betId,
    answerOutcome: answerOutcome,
    replyToCommentId: replyToCommentId,
  })
  track('comment', {
    contractId,
    commentId: ref.id,
    betId: betId,
    replyToCommentId: replyToCommentId,
  })
  return await setDoc(ref, comment)
}
export async function createCommentOnGroup(
  groupId: string,
  content: JSONContent,
  user: User,
  replyToCommentId?: string
) {
  const ref = doc(getCommentsOnGroupCollection(groupId))
  const comment = removeUndefinedProps({
    id: ref.id,
    commentType: 'group',
    groupId,
    userId: user.id,
    content: content,
    createdTime: Date.now(),
    userName: user.name,
    userUsername: user.username,
    userAvatarUrl: user.avatarUrl,
    replyToCommentId: replyToCommentId,
  })
  track('group message', {
    user,
    commentId: ref.id,
    groupId,
    replyToCommentId: replyToCommentId,
  })
  return await setDoc(ref, comment)
}

function getCommentsCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'comments')
}

function getCommentsOnGroupCollection(groupId: string) {
  return collection(db, 'groups', groupId, 'comments')
}

export async function listAllComments(contractId: string) {
  return await getValues<Comment>(
    query(getCommentsCollection(contractId), orderBy('createdTime', 'desc'))
  )
}

export async function listAllCommentsOnGroup(groupId: string) {
  return await getValues<GroupComment>(
    query(getCommentsOnGroupCollection(groupId), orderBy('createdTime', 'desc'))
  )
}

export function listenForCommentsOnContract(
  contractId: string,
  setComments: (comments: ContractComment[]) => void
) {
  return listenForValues<ContractComment>(
    query(getCommentsCollection(contractId), orderBy('createdTime', 'desc')),
    setComments
  )
}

export function listenForCommentsOnGroup(
  groupId: string,
  setComments: (comments: GroupComment[]) => void
) {
  return listenForValues<GroupComment>(
    query(
      getCommentsOnGroupCollection(groupId),
      orderBy('createdTime', 'desc')
    ),
    setComments
  )
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

// Define "recent" as "<3 days ago" for now
const recentCommentsQuery = query(
  collectionGroup(db, 'comments'),
  where('createdTime', '>', Date.now() - 3 * DAY_IN_MS),
  orderBy('createdTime', 'desc')
)

export async function getRecentComments() {
  return getValues<Comment>(recentCommentsQuery)
}

export function listenForRecentComments(
  setComments: (comments: Comment[]) => void
) {
  return listenForValues<Comment>(recentCommentsQuery, setComments)
}

export const getUserCommentsQuery = (userId: string) =>
  query(
    collectionGroup(db, 'comments'),
    where('userId', '==', userId),
    where('commentType', '==', 'contract'),
    orderBy('createdTime', 'desc')
  ) as Query<ContractComment>
