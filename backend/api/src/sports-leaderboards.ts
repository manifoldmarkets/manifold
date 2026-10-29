import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getSportsLeaderboards } from 'shared/supabase/sports-leaderboards'

export const sportsLeaderboards: APIHandler<'sports-leaderboards'> = async ({
  sport,
}) => getSportsLeaderboards(createSupabaseDirectClient(), sport)
