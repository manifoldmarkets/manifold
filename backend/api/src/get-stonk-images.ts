import { StonkImage } from 'common/stonk-images'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const getStonkImages: APIHandler<'get-stonk-images'> = async ({
  contracts,
}) => {
  const pg = createSupabaseDirectClient()

  const images = await pg.manyOrNone<{
    contract_id: string
    image_url: string
  }>(
    `select * from stonk_images where contract_id in (${contracts
      .map((id) => `'${id}'`)
      .join(',')})`
  )

  return {
    images: images.map((i) => ({
      contractId: i.contract_id,
      imageUrl: i.image_url,
    })),
  }
}
