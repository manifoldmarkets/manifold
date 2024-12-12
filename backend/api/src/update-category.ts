import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const updateCategory: APIHandler<'update-category'> = async (
  props,
  auth
) => {
  const { categoryId, name, color, displayOrder, archived } = props
  const pg = createSupabaseDirectClient()

  console.log('Updating category', {
    categoryId,
    name,
    color,
    displayOrder,
    archived,
    userId: auth.uid,
  })

  const updates: { [key: string]: any } = {}
  if (name !== undefined) updates.name = name
  if (color !== undefined) updates.color = color
  if (displayOrder !== undefined) updates.display_order = displayOrder
  if (archived !== undefined) updates.archived = archived

  const setClauses = Object.entries(updates)
    .map(([key], i) => `${key} = $${i + 3}`)
    .join(', ')

  await pg.none(
    `update categories 
     set ${setClauses}
     where id = $1 and user_id = $2`,
    [categoryId, auth.uid, ...Object.values(updates)]
  )

  return { success: true }
}
