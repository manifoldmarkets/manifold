import { Row } from 'common/supabase/utils'
import { getPrivateUser, getUser } from './utils'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from './supabase/init'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { Notification } from 'common/notification'
import { getLoverRow } from 'common/love/lover'
import { insertNotificationToSupabase } from './supabase/notifications'

export const createLoveLikeNotification = async (like: Row<'love_likes'>) => {
  const { creator_id, target_id, like_id } = like

  const db = createSupabaseClient()

  const targetPrivateUser = await getPrivateUser(target_id)
  const user = await getUser(creator_id)
  const lover = await getLoverRow(creator_id, db)

  if (!targetPrivateUser || !user) return

  const { sendToBrowser } = getNotificationDestinationsForUser(
    targetPrivateUser,
    'new_love_like'
  )
  if (!sendToBrowser) return

  const id = `${creator_id}-${like_id}`
  const notification: Notification = {
    id,
    userId: target_id,
    reason: 'new_love_like',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: like_id,
    sourceType: 'love_like',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: lover.pinned_url ?? user.avatarUrl,
    sourceText: '',
  }
  const pg = createSupabaseDirectClient()
  return await insertNotificationToSupabase(notification, pg)
}
