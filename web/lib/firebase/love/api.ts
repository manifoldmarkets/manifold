import { getApiUrl } from 'common/api/utils'
import { call } from 'web/lib/firebase/api'
import { JSONContent } from '@tiptap/core'
import { removeNullOrUndefinedProps } from 'common/util/object'
import { Json } from 'common/supabase/schema'

export function createLover(params: any) {
  return call(getApiUrl('create-lover'), 'POST', params)
}

export function updateLover(params: any) {
  return call(
    getApiUrl('update-lover'),
    'POST',
    removeNullOrUndefinedProps(params, ['bio'])
  )
}

export function rejectLover(params: { userId: string }) {
  return call(getApiUrl('reject-lover'), 'POST', params)
}

export function confirmLoverStage(params: {
  contractId: string
  answerId: string
}) {
  return call(getApiUrl('confirm-lover-stage'), 'POST', params)
}

export function createMatch(params: {
  userId1: string
  userId2: string
  betAmount: number
  introduction: JSONContent | undefined
}) {
  return call(getApiUrl('create-match'), 'POST', params)
}

export function createCommentOnLover(params: {
  userId: string
  content: JSONContent
  replyToCommentId?: string
}) {
  return call(getApiUrl('create-comment-on-lover'), 'POST', params)
}

export function hideCommentOnLover(params: {
  commentId: string
  hide: boolean
}) {
  return call(getApiUrl('hide-comment-on-lover'), 'POST', params)
}

export function createLoveCompatibilityQuestion(params: {
  question: string
  options: Json
}) {
  return call(getApiUrl('createlovecompatibilityquestion'), 'POST', params)
}
