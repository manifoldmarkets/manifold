import {
  collection,
  collectionGroup,
  doc,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { range } from 'lodash'

import { getValues, listenForValues } from './utils'
import { db } from './init'
import { User } from 'common/user'
import { Comment } from 'common/comment'
import { removeUndefinedProps } from 'common/util/object'
import { track } from '@amplitude/analytics-browser'

export type { Comment }

export const MAX_COMMENT_LENGTH = 10000

export async function createCommentOnContract(
  contractId: string,
  text: string,
  commenter: User,
  betId?: string,
  answerOutcome?: string,
  replyToCommentId?: string
) {
  const ref = betId
    ? doc(getCommentsCollection(contractId), betId)
    : doc(getCommentsCollection(contractId))
  const comment: Comment = removeUndefinedProps({
    id: ref.id,
    contractId,
    userId: commenter.id,
    text: text.slice(0, MAX_COMMENT_LENGTH),
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
  text: string,
  user: User,
  replyToCommentId?: string
) {
  const ref = doc(getCommentsCollection(groupId))
  const comment: Comment = removeUndefinedProps({
    id: ref.id,
    groupId,
    userId: user.id,
    text: text.slice(0, MAX_COMMENT_LENGTH),
    createdTime: Date.now(),
    userName: user.name,
    userUsername: user.username,
    userAvatarUrl: user.avatarUrl,
    replyToCommentId: replyToCommentId,
  })
  track('comment', {
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
  const comments = await getValues<Comment>(getCommentsCollection(contractId))
  comments.sort((c1, c2) => c1.createdTime - c2.createdTime)
  return comments
}

export function listenForCommentsOnContract(
  contractId: string,
  setComments: (comments: Comment[]) => void
) {
  return listenForValues<Comment>(
    getCommentsCollection(contractId),
    (comments) => {
      comments.sort((c1, c2) => c1.createdTime - c2.createdTime)
      setComments(comments)
    }
  )
}
export function listenForCommentsOnGroup(
  groupId: string,
  setComments: (comments: Comment[]) => void
) {
  return listenForValues<Comment>(
    getCommentsOnGroupCollection(groupId),
    (comments) => {
      comments.sort((c1, c2) => c1.createdTime - c2.createdTime)
      setComments(comments)
    }
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

const getCommentsQuery = (startTime: number, endTime: number) =>
  query(
    collectionGroup(db, 'comments'),
    where('createdTime', '>=', startTime),
    where('createdTime', '<', endTime),
    orderBy('createdTime', 'asc')
  )

export async function getDailyComments(
  startTime: number,
  numberOfDays: number
) {
  const query = getCommentsQuery(
    startTime,
    startTime + DAY_IN_MS * numberOfDays
  )
  const comments = await getValues<Comment>(query)

  const commentsByDay = range(0, numberOfDays).map(() => [] as Comment[])
  for (const comment of comments) {
    const dayIndex = Math.floor((comment.createdTime - startTime) / DAY_IN_MS)
    commentsByDay[dayIndex].push(comment)
  }

  return commentsByDay
}

const getUsersCommentsQuery = (userId: string) =>
  query(
    collectionGroup(db, 'comments'),
    where('userId', '==', userId),
    orderBy('createdTime', 'desc')
  )
export async function getUsersComments(userId: string) {
  return await getValues<Comment>(getUsersCommentsQuery(userId))
}
