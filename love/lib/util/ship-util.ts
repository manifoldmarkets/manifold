import { User } from 'common/user'
import { ShipData } from '../supabase/ships'

export const hasShipped = (
  currentUser: User | null | undefined,
  target1Id: string | undefined,
  target2Id: string | undefined,
  ships: ShipData[]
) => {
  return Boolean(
    currentUser &&
      target1Id &&
      target2Id &&
      ships.some(
        ({ creator_id, target1_id, target2_id }) =>
          creator_id === currentUser.id &&
          ((target1_id === target1Id && target2_id === target2Id) ||
            (target1_id === target2Id && target2_id === target1Id))
      )
  )
}
