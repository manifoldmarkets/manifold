import {
  Query,
  collection,
  collectionGroup,
  doc,
  orderBy,
  query,
  setDoc,
  where,
  DocumentData,
  DocumentReference,
} from 'firebase/firestore'

import { getValues, listenForValues } from './utils'
import { db } from './init'
import { User } from 'common/user'
import {
  Comment,
  ContractComment,
  GroupComment,
  PostComment,
} from 'common/comment'
import { removeUndefinedProps } from 'common/util/object'
import { track } from '@amplitude/analytics-browser'
import { JSONContent } from '@tiptap/react'

export type { Comment }

export const MAX_COMMENT_LENGTH = 10000

export async function createCommentOnContract(
  contractId: string,
  content: JSONContent,
  user: User,
  betId?: string,
  answerOutcome?: string,
  replyToCommentId?: string
) {
  const ref = betId
    ? doc(getCommentsCollection(contractId), betId)
    : doc(getCommentsCollection(contractId))
  return await createComment(
    contractId,
    'contract',
    content,
    user,
    ref,
    replyToCommentId,
    { answerOutcome: answerOutcome, betId: betId }
  )
}
export async function createCommentOnGroup(
  groupId: string,
  content: JSONContent,
  user: User,
  replyToCommentId?: string
) {
  const ref = doc(getCommentsOnGroupCollection(groupId))
  return await createComment(
    groupId,
    'group',
    content,
    user,
    ref,
    replyToCommentId
  )
}

export async function createCommentOnPost(
  postId: string,
  content: JSONContent,
  user: User,
  replyToCommentId?: string
) {
  const ref = doc(getCommentsOnPostCollection(postId))

  return await createComment(
    postId,
    'post',
    content,
    user,
    ref,
    replyToCommentId
  )
}

async function createComment(
  surfaceId: string,
  surfaceType: 'contract' | 'group' | 'post',
  content: JSONContent,
  user: User,
  ref: DocumentReference<DocumentData>,
  replyToCommentId?: string,
  extraFields: { [key: string]: any } = {}
) {
  const comment = removeUndefinedProps({
    id: ref.id,
    userId: user.id,
    content: content,
    createdTime: Date.now(),
    userName: user.name,
    userUsername: user.username,
    userAvatarUrl: user.avatarUrl,
    replyToCommentId: replyToCommentId,
    ...extraFields,
  })

  track(`${surfaceType} message`, {
    user,
    commentId: ref.id,
    surfaceId,
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

function getCommentsOnPostCollection(postId: string) {
  return collection(db, 'posts', postId, 'comments')
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

export async function listAllCommentsOnPost(postId: string) {
  return await getValues<PostComment>(
    query(getCommentsOnPostCollection(postId), orderBy('createdTime', 'desc'))
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

export function listenForCommentsOnPost(
  postId: string,
  setComments: (comments: PostComment[]) => void
) {
  return listenForValues<PostComment>(
    query(getCommentsOnPostCollection(postId), orderBy('createdTime', 'desc')),
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
