import { useEffect, useState } from 'react'
import { groupBy, sortBy } from 'lodash'
import { ClockIcon } from '@heroicons/react/outline'
import { useRouter } from 'next/router'

import {
  DIVISION_NAMES,
  SEASONS,
  SEASON_END,
  getDemotionAndPromotionCount,
  league_row,
  season,
  CURRENT_SEASON,
  getLeaguePath,
} from 'common/leagues'
import { toLabel } from 'common/util/adjective-animal'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { Countdown } from 'web/components/widgets/countdown'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useTracking } from 'web/hooks/use-tracking'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getLeagueRows } from 'web/lib/supabase/leagues'
import { CohortTable } from 'web/components/leagues/cohort-table'
import { PrizesModal } from 'web/components/leagues/prizes-modal'
import { LeagueFeed } from 'web/components/leagues/league-feed'

export async function getStaticProps() {
  const rows = await getLeagueRows()
  return {
    props: {
      rows,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export default function Leagues(props: { rows: league_row[] }) {
  useTracking('view leagues')

  const [rows, setRows] = usePersistentInMemoryState<league_row[]>(
    props.rows,
    'league-rows'
  )

  useEffect(() => {
    getLeagueRows().then(setRows)
  }, [])

  const cohorts = groupBy(rows, 'cohort')
  const cohortNames = sortBy(Object.keys(cohorts), (cohort) =>
    cohort.toLowerCase()
  )
  const divisionToCohorts = groupBy(
    cohortNames,
    (cohort) => cohorts[cohort][0].division
  )
  const divisions = sortBy(
    Object.keys(divisionToCohorts).map((division) => +division),
    (division) => division
  ).reverse()

  const [season, setSeason] = useState<number>(1)
  const [division, setDivision] = useState<number>(4)
  const [cohort, setCohort] = useState(divisionToCohorts[4][0])
  const [highlightedUserId, setHighlightedUserId] = useState<
    string | undefined
  >()
  const [prizesModalOpen, setPrizesModalOpen] = useState(false)
  const togglePrizesModal = () => {
    setPrizesModalOpen(!prizesModalOpen)
  }

  const user = useUser()
  const { query, isReady, replace } = useRouter()
  const { leagueSlugs } = query as { leagueSlugs: string[] }

  const onSetDivision = (division: number) => {
    const userRow = rows.find(
      (row) => row.user_id === user?.id && row.division === division
    )
    const cohort = userRow ? userRow.cohort : divisionToCohorts[division][0]

    replace(getLeaguePath(season, division, cohort), undefined, {
      shallow: true,
    })
  }

  const onSetCohort = (cohort: string) => {
    replace(getLeaguePath(season, division, cohort), undefined, {
      shallow: true,
    })
  }

  const userRow = rows.find((row) => row.user_id === user?.id)
  const userDivision = userRow?.division
  const userCohort = userRow?.cohort

  useEffect(() => {
    if (!isReady) return

    if (leagueSlugs) {
      const [season, division, cohort, userId] = leagueSlugs
      if (SEASONS.includes(+season as season)) {
        setSeason(+season)
      } else {
        setSeason(CURRENT_SEASON)
      }

      let divisionNum: number | undefined
      if (Object.keys(DIVISION_NAMES).includes(division)) {
        divisionNum = +division
      } else {
        const divisionName = Object.keys(DIVISION_NAMES).find(
          (key) =>
            DIVISION_NAMES[key]?.toLowerCase() === division?.toLowerCase()
        )
        if (divisionName) divisionNum = +divisionName
      }

      if (divisionNum) {
        setDivision(divisionNum)

        const cohorts = divisionToCohorts[divisionNum] ?? []
        const matchedCohort = cohorts.find(
          (c) => c?.toLowerCase() === cohort?.toLowerCase()
        )
        if (matchedCohort) {
          setCohort(matchedCohort)

          if (
            userId &&
            rows.find(
              (row) => row.user_id === userId && row.division === divisionNum
            )
          ) {
            setHighlightedUserId(userId)
          }
        }
      }
    } else if (userRow) {
      setDivision(userRow.division)
      setCohort(userRow.cohort)
      setHighlightedUserId(userRow.user_id)
    }
  }, [isReady, leagueSlugs, user])

  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCount(division)

  const MARKER = '●️'

  return (
    <Page>
      <Col className="mx-auto w-full max-w-lg gap-4 pb-8 pt-2 sm:pt-0">
        <Col className="px-2 sm:px-0">
          <Row className="mb-4 justify-between">
            <Title className="!mb-0">Leagues</Title>
          </Row>

          <Row className="mb-4 items-center gap-3">
            <text className="">
              Compete against similarly skilled users for{' '}
              <span
                className="cursor-pointer border-b border-dotted border-blue-600 text-blue-600 hover:text-blue-800"
                onClick={togglePrizesModal}
              >
                prizes
              </span>{' '}
              and promotion by earning the most mana this month!
            </text>
            <PrizesModal open={prizesModalOpen} setOpen={setPrizesModalOpen} />
          </Row>
          <Row className="items-center gap-3">
            <Col className="items-center gap-1">
              <Select
                className="!border-ink-200 !h-10"
                value={season}
                onChange={(e) => setSeason(+e.target.value as season)}
              >
                {SEASONS.map((season) => (
                  <option key={season} value={season}>
                    Season {season}: May
                  </option>
                ))}
              </Select>
            </Col>
            <Col className="items-center gap-1">
              <Row className="items-center gap-1.5">
                <ClockIcon className="text-ink-1000 h-4 w-4" />{' '}
                <Row className={' gap-1 text-sm'}>
                  <InfoTooltip
                    text={
                      'Once the countdown is reached the leaderboards will freeze at a random time in the following 24h to determine final ranks.'
                    }
                  >
                    Ends in{' '}
                    <Countdown className=" text-sm" endDate={SEASON_END} />
                  </InfoTooltip>
                </Row>
              </Row>
            </Col>
          </Row>
          <Row className="mt-2 gap-2">
            <Select
              className="!border-ink-200"
              value={division}
              onChange={(e) => onSetDivision(+e.target.value)}
            >
              {divisions.map((division) => (
                <option key={division} value={division}>
                  {division === userDivision && MARKER}{' '}
                  {DIVISION_NAMES[division]}
                </option>
              ))}
            </Select>

            <Select
              className="!border-ink-200"
              value={cohort}
              onChange={(e) => onSetCohort(e.target.value)}
            >
              {divisionToCohorts[division].map((cohort) => (
                <option key={cohort} value={cohort}>
                  {cohort === userCohort && MARKER} {toLabel(cohort)}
                </option>
              ))}
            </Select>
          </Row>
        </Col>

        <CohortTable
          cohort={cohort}
          rows={cohorts[cohort]}
          highlightedUserId={highlightedUserId}
          demotionCount={demotion}
          promotionCount={promotion}
          doublePromotionCount={doublePromotion}
        />

        <LeagueFeed season={season} cohort={cohort} />
      </Col>
    </Page>
  )
}
