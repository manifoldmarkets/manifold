import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getElectionLeaderboards } from 'shared/supabase/election-leaderboards'

export const electionLeaderboards: APIHandler<
  'election-leaderboards'
> = async () => getElectionLeaderboards(createSupabaseDirectClient())
