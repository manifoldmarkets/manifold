export type GroupInvite = {
  id: string
  group_id: string
  uses: number
  max_uses: number | null
  created_time: Date
  duration: string
  expire_time: Date
  is_forever: boolean
  is_max_uses_reached: boolean
}
