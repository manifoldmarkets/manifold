import { publishMnx } from 'shared/perps/publish-mnx'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const updateMnx = () => publishMnx(createSupabaseDirectClient())
