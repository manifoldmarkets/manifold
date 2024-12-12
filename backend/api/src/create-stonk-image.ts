import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const createStonkImage: APIHandler<'create-stonk-image'> = async (
  props,
  _auth
) => {
  const { contractId, imageUrl } = props

  const pg = createSupabaseDirectClient()

  const image = await pg.oneOrNone(
    `insert into stonk_images (contract_id, image_url)
        values ($1, $2) returning *`,
    [contractId, imageUrl]
  )

  return { success: true }
}
