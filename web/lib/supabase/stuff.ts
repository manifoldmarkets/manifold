import { createClient } from '@supabase/supabase-js'
import { DEV_CONFIG } from 'common/envs/dev'

// TODO: rewrite entirely. Set up types, put keys as env vars or set up row level access

const SUPABASE_READ_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mb2RvbnpueWZ4bGxjZXp1ZmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2Njc5ODgxNjcsImV4cCI6MTk4MzU2NDE2N30.RK8CA3G2_yccgiIFoxzweEuJ2XU5SoB7x7wBzMKitvo'

const supabase = createClient(DEV_CONFIG.supabaseUrl ?? '', SUPABASE_READ_KEY)

export async function searchUsers(prompt: string) {
  const { data } = await supabase
    .from('users')
    .select(
      'data->username, data->name, data->id, data->avatarUrl, data->followerCountCached'
    )
    .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
  // TODO: use fts (fullTextsearch) instead - may need to add index?

  return data
}
