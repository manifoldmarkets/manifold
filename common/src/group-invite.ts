export type GroupInvite = {
  id: string
  group_id: string
  uses: number
  max_uses: number | null
  created_time: Date
  duration: unknown
  expire_time: Date | null
  is_forever: boolean | null
  is_max_uses_reached: boolean | null
}
