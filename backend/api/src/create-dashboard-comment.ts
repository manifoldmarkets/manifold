import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { DashboardItemSchema, contentSchema } from 'shared/zod-types'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import { DashboardComment } from 'common/comment'

const schema = z.object({
  dashboard_id: z.string(),
  dashboard_slug: z.string(),
  dashboard_title: z.string(),
  reply_to_comment_id: z.string().optional(),
  content: contentSchema,
  visibility: z.string().optional(),
})

export const createdashboardcomment = authEndpoint(async (req, auth) => {
  const {
    dashboard_id,
    dashboard_slug,
    dashboard_title,
    reply_to_comment_id,
    content,
    visibility,
  } = validate(schema, req.body)

  log('creating dashboard comment')
  const pg = createSupabaseDirectClient()

  const { data: user } = await pg.one(`select data from users where id = $1`, [
    auth.uid,
  ])

  // create if not exists the group invite link row
  const newDashboardComment = await pg.one(
    `insert into dashboard_comments(
      dashboard_id,
      dashboard_slug,
      dashboard_title,
      reply_to_comment_id,
      content,
      user_id,
      user_name,
      user_username,
      user_avatar_url,
      visibility
      )
      values ($1, $2, $3,$4, $5, $6, $7, $8, $9, $10)
      returning *`,
    [
      dashboard_id,
      dashboard_slug,
      dashboard_title,
      reply_to_comment_id,
      JSON.stringify(content),
      user.id,
      user.name,
      user.username,
      user.avatarUrl,
      visibility,
    ]
  )

  // return something
  return {
    commentType: 'dashboard',
    id: newDashboardComment.id,
    dashboardSlug: newDashboardComment.dashboard_slug,
    dashboardTitle: newDashboardComment.dashboard_title,
    dashboardId: newDashboardComment.dashboard_id,
    replyToCommentId: newDashboardComment.reply_to_comment_id,
    userId: newDashboardComment.user_id,
    content: newDashboardComment.content,
    createdTime: newDashboardComment.created_time,
    userName: newDashboardComment.user_name,
    userUsername: newDashboardComment.user_username,
    userAvatarUrl: newDashboardComment.user_avatar_url,
    likes: newDashboardComment.likes,
    hidden: newDashboardComment.hidden,
    hiddenTime: newDashboardComment.hidden_time,
    hiderId: newDashboardComment.hider_id,
    visibility: newDashboardComment.visibility,
    editedTime: newDashboardComment.edited_time,
  } as DashboardComment
})
