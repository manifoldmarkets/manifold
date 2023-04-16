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
  limit,
} from 'firebase/firestore'

import { getValues, listenForValues } from './utils'
import { db } from './init'
import { User } from 'common/user'
import {
  Comment,
  ContractComment,
  GroupComment,
  OnContract,
  OnGroup,
  OnPost,
  PostComment,
} from 'common/comment'
import { removeUndefinedProps } from 'common/util/object'
import { JSONContent } from '@tiptap/react'
import { track } from '../service/analytics'
import { Post } from 'common/post'
import { visibility } from 'common/contract'

export type { Comment }

export const MAX_COMMENT_LENGTH = 10000

export async function createCommentOnPost(
  post: Post,
  content: JSONContent,
  user: User,
  replyToCommentId?: string
) {
  const ref = doc(getCommentsOnPostCollection(post.id))
  const onPost = { postId: post.id, commentType: 'post' } as OnPost
  return await createComment(
    post.id,
    onPost,
    content,
    user,
    ref,
    post.visibility == 'private' ? 'private' : 'public',
    replyToCommentId
  )
}

async function createComment(
  surfaceId: string,
  extraFields: OnContract | OnGroup | OnPost,
  content: JSONContent,
  user: User,
  ref: DocumentReference<DocumentData>,
  visibility: visibility,
  replyToCommentId?: string
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
    visibility: visibility,
    ...extraFields,
  })
  track(
    `${extraFields.commentType} message`,
    removeUndefinedProps({
      user,
      commentId: ref.id,
      surfaceId,
      replyToCommentId: replyToCommentId,
    })
  )
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

export async function listAllComments(
  contractId: string,
  maxCount: number | undefined = undefined
) {
  const q = query(
    getCommentsCollection(contractId),
    orderBy('createdTime', 'desc')
  )
  const limitedQ = maxCount ? query(q, limit(maxCount)) : q
  return await getValues<ContractComment>(limitedQ)
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

export function listenForLiveComments(
  count: number,
  setComments: (comments: Comment[]) => void
) {
  const commentsQuery = query(
    collectionGroup(db, 'comments'),
    orderBy('createdTime', 'desc'),
    limit(count)
  )
  return listenForValues<Comment>(commentsQuery, setComments)
}
