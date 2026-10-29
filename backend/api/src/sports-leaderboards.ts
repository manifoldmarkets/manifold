import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getSportsLeaderboards } from 'shared/supabase/sports-leaderboards'
import { topicBoardKey } from 'common/sports-leaderboards'

export const sportsLeaderboards: APIHandler<'sports-leaderboards'> = async ({
  sport,
  topic,
  userId,
}) =>
  getSportsLeaderboards(
    createSupabaseDirectClient(),
    topic ? topicBoardKey(topic) : sport ?? 'all',
    userId
  )
