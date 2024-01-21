import { Row } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export type ShipData = Omit<Row<'love_ships'>, 'created_time'> & {
  created_time: number
}

export const getShipsForUser = async (
  targetId: string
): Promise<ShipData[]> => {
  const { data, error } = await db
    .from('love_ships')
    .select('*')
    .or(`target1_id.eq.${targetId},target2_id.eq.${targetId}`)

  if (error) {
    console.error('Error fetching ships:', error)
    throw error
  }

  return data
    ? data.map((ship) => ({
        ...ship,
        created_time: new Date(ship.created_time).getTime(),
      }))
    : []
}
