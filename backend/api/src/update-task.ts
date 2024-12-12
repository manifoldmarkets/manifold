import { log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const updateTask: APIHandler<'update-task'> = async (props, auth) => {
  const { id, text, completed, priority, categoryId, archived } = props
  const pg = createSupabaseDirectClient()

  log('Updating task', props)

  // Build update fields dynamically
  const updates: { [key: string]: any } = {}
  if (completed !== undefined) updates.completed = completed
  if (priority !== undefined) updates.priority = priority
  if (categoryId !== undefined) updates.category_id = categoryId
  if (text !== undefined) updates.text = text
  if (archived !== undefined) updates.archived = archived
  const setClauses = Object.entries(updates)
    .map(([key], i) => `${key} = $${i + 3}`)
    .join(', ')

  const result = await pg.oneOrNone(
    `update tasks 
     set ${setClauses}
     where id = $1 and (creator_id = $2 or assignee_id = $2)
     returning id, priority, category_id, text, completed
    `,
    [id, auth.uid, ...Object.values(updates)]
  )

  if (!result) {
    throw new APIError(404, 'Task not found or unauthorized')
  }

  return { success: true }
}
