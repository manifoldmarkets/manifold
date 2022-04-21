import {
  doc,
  collection,
  setDoc,
  query,
  collectionGroup,
  where,
  orderBy,
} from 'firebase/firestore'
import _ from 'lodash'

import { getValues, listenForValues } from './utils'
import { db } from './init'
import { User } from '../../../common/user'
import { Comment } from '../../../common/comment'
export type { Comment }

export const MAX_COMMENT_LENGTH = 10000

export async function createComment(
  contractId: string,
  text: string,
  commenter: User,
  betId?: string
) {
  if (betId) {
    const ref = doc(getCommentsCollection(contractId), betId)
    const comment: Comment = {
      id: ref.id,
      betId: betId,
      contractId,
      userId: commenter.id,
      text: text.slice(0, MAX_COMMENT_LENGTH),
      createdTime: Date.now(),
      userName: commenter.name,
      userUsername: commenter.username,
      userAvatarUrl: commenter.avatarUrl,
    }
    return await setDoc(ref, comment)
  } else {
    const newCommentRef = doc(getCommentsCollection(contractId))
    let comment: Comment = {
      id: newCommentRef.id,
      contractId,
      userId: commenter.id,
      text: text.slice(0, MAX_COMMENT_LENGTH),
      createdTime: Date.now(),
      userName: commenter.name,
      userUsername: commenter.username,
      userAvatarUrl: commenter.avatarUrl,
    }
    return await setDoc(newCommentRef, comment)
  }
}

function getCommentsCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'comments')
}

export async function listAllComments(contractId: string) {
  const comments = await getValues<Comment>(getCommentsCollection(contractId))
  comments.sort((c1, c2) => c1.createdTime - c2.createdTime)
  return comments
}

export function listenForComments(
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

// Return a map of betId -> comment
export function mapCommentsByBetId(comments: Comment[]) {
  const map: Record<string, Comment> = {}
  for (const comment of comments) {
    if (comment.betId) {
      map[comment.betId] = comment
    }
  }
  return map
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

  const commentsByDay = _.range(0, numberOfDays).map(() => [] as Comment[])
  for (const comment of comments) {
    const dayIndex = Math.floor((comment.createdTime - startTime) / DAY_IN_MS)
    commentsByDay[dayIndex].push(comment)
  }

  return commentsByDay
}
