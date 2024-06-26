import { createSupabaseDirectClient } from 'shared/supabase/init'

export const incrementStreakForgiveness = async () => {
  const pg = createSupabaseDirectClient()
  await pg.none(`
    update users set data = data || 
      jsonb_build_object('streakForgiveness', 
        coalesce((data->'streakForgiveness')::numeric, 0) + 1
      )
  `)
}
