import { resumeStalledAnnouncementDeliveries } from 'shared/notifications/announcement-delivery'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// create-post sends an announcement as soon as it is posted. If that send dies
// (an API restart or deploy, a run of failing batches), this picks it up
// where it stopped. A send still unfinished after this run makes the run
// fail, so it shows as a job error until the send gets through.
export async function resumeAnnouncementDeliveries() {
  const pg = createSupabaseDirectClient()
  await resumeStalledAnnouncementDeliveries(pg)
}
