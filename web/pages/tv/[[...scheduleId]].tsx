import { getContracts } from 'common/supabase/contracts'
import { HOUR_MS } from 'common/util/time'
import { TVPage } from 'web/components/tv/tv-page'
import { ScheduleItem } from 'web/components/tv/tv-schedule'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export async function getStaticProps(props: {
  params: { scheduleId: string[] }
}) {
  const db = await initSupabaseAdmin()
  const scheduleId = props.params.scheduleId?.[0] ?? null

  const cutoff = new Date(Date.now() - HOUR_MS).toISOString()
  let query = db
    .from('tv_schedule')
    .select('*')
    .order('start_time', { ascending: true })

  if (scheduleId) {
    query = query.or(`end_time.gt.${cutoff},id.eq.${scheduleId}`)
  } else {
    query = query.gt('end_time', cutoff)
  }

  const { data } = await query
  const schedule = (data ?? []) as ScheduleItem[]

  const contractIds = schedule.map((s) => s.contract_id)
  const contracts = await getContracts(db, contractIds)

  return {
    props: {
      contracts,
      schedule,
      scheduleId,
    },
    revalidate: 60,
  }
}

export default TVPage
