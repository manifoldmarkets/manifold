import { mapKeys } from 'lodash'
import { Contract } from 'common/contract'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useContracts } from 'web/hooks/use-contract'
import { ScheduleItem, getActiveStream, useTVSchedule } from './tv-schedule'
import { TVDisplay } from './tv-display'
import { TVSchedulePage } from './tv-schedule-page'
import { capitalize } from 'lodash'
import { TRADE_TERM } from 'common/envs/constants'

export function TVPage(props: {
  schedule: ScheduleItem[]
  contracts: Contract[]
  scheduleId: string | null
}) {
  const schedule = useTVSchedule(props.schedule, props.scheduleId)

  const contractsList = props.contracts.concat(
    useContracts(
      schedule.map((s) => s.contract_id),
      undefined
    )
  )
  const contracts = mapKeys(contractsList, 'id')

  const stream = getActiveStream(schedule, props.scheduleId)
  const contract = contracts[stream?.contract_id ?? '']

  if (!contract && props.scheduleId && props.scheduleId !== 'schedule') {
    return (
      <Page trackPageView="tv page">
        <SEO
          title="Manifold TV"
          description={`${capitalize(
            TRADE_TERM
          )} on live video streams with Manifold TV`}
        />
        <Title>Manifold TV</Title>
        <div className="italic">Cannot find scheduled event</div>
      </Page>
    )
  }

  if (!contract || props.scheduleId === 'schedule')
    return <TVSchedulePage schedule={schedule} contracts={contracts} />

  return <TVDisplay contract={contract} stream={stream} />
}
