import { getApiUrl } from 'common/api'
import { call } from 'web/lib/firebase/api'
import { JSONContent } from '@tiptap/core'

export function createLover(params: any) {
  return call(getApiUrl('create-lover'), 'POST', params)
}

export function updateLover(params: any) {
  return call(getApiUrl('update-lover'), 'POST', params)
}

export function createMatch(params: {
  userId1: string
  userId2: string
  betAmount: number
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
