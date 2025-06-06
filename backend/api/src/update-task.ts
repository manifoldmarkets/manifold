import { log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const updateTask: APIHandler<'update-task'> = async (props, auth) => {
  const { id, text, completed, priority, category_id, archived, assignee_id } =
    props
  const pg = createSupabaseDirectClient()
  log('Updating task', props)

  // Build update fields dynamically
  const updates: { [key: string]: any } = {}
  if (completed !== undefined) updates.completed = completed
  if (priority !== undefined) updates.priority = priority
  if (category_id !== undefined) updates.category_id = category_id
  if (text !== undefined) updates.text = text
  if (archived !== undefined) updates.archived = archived
  if (assignee_id !== undefined) updates.assignee_id = assignee_id
  const setClauses = Object.entries(updates)
    .map(([key], i) => `${key} = $${i + 3}`)
    .join(', ')

  const result = await pg.oneOrNone(
    `update tasks 
     set ${setClauses}
     where id = $1 and (creator_id = $2 or assignee_id = $2)
     returning id, priority, category_id, text, completed, assignee_id
    `,
    [id, auth.uid, ...Object.values(updates)]
  )

  if (!result) {
    throw new APIError(404, 'Task not found or unauthorized')
  }

  return { success: true }
}
