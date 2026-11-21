import { resumeStalledAnnouncementDeliveries } from 'shared/notifications/announcement-delivery'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// create-post sends an announcement as soon as it is posted. If that send dies
// (an API restart or deploy, a run of failing batches), this picks it up
// where it stopped. A send that keeps failing logs an error on every run.
export async function resumeAnnouncementDeliveries() {
  const pg = createSupabaseDirectClient()
  await resumeStalledAnnouncementDeliveries(pg)
}
