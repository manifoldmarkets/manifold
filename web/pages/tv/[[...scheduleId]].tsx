import { getContracts } from 'common/supabase/contracts'
import { isTVElectionBoard } from 'common/tv'
import { HOUR_MS } from 'common/util/time'
import { TVPage } from 'web/components/tv/tv-page'
import { getActiveStream, ScheduleItem } from 'web/components/tv/tv-schedule'
import { getElectionMapProps } from 'web/lib/politics/home'
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

  const contractIds = schedule
    .map((s) => s.contract_id)
    .filter((id) => !isTVElectionBoard(id))
  const contracts = await getContracts(db, contractIds)

  // The election board's markets, only when this page will show it.
  const stream =
    scheduleId === 'schedule'
      ? undefined
      : getActiveStream(schedule, scheduleId)
  const electionMap = isTVElectionBoard(stream?.contract_id)
    ? await getElectionMapProps(db).catch((e) => {
        console.error('TV election map unavailable', e)
        return null
      })
    : null

  return {
    props: {
      contracts,
      schedule,
      scheduleId,
      electionMap,
    },
    revalidate: 60,
  }
}

export default TVPage
