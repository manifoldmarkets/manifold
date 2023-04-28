import { SEASONS, division, getDivisionName, season } from 'common/leagues'
import { toLabel } from 'common/util/adjective-animal'
import { groupBy } from 'lodash'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { Title } from 'web/components/widgets/title'
import { db } from 'web/lib/supabase/db'

export async function getStaticProps() {
  const { data: rows } = await db.from('leagues').select('*')
  return {
    props: {
      rows: rows ?? [],
    },
  }
}

export default function Leagues(props: { rows: any[] }) {
  const { rows } = props

  const cohorts = groupBy(rows, 'cohort')
  const cohortNames = Object.keys(cohorts)
  const divisionToCohorts = groupBy(
    cohortNames,
    (cohort) => cohorts[cohort][0].division
  )

  const [season, setSeason] = useState<season>(1)
  const [division, setDivision] = useState<division>(1)
  const [cohort, setCohort] = useState(cohortNames[0])

  return (
    <Page>
      <Col>
        <Title>Leagues</Title>

        <Row className="gap-2">
          <Select
            className="!border-ink-200"
            value={season}
            onChange={(e) => setSeason(+e.target.value as season)}
          >
            {SEASONS.map((season) => (
              <option key={season} value={season}>
                Season {season}
              </option>
            ))}
          </Select>

          <Select
            className="!border-ink-200"
            value={division}
            onChange={(e) => setDivision(+e.target.value as division)}
          >
            {Object.keys(divisionToCohorts).map((division) => (
              <option key={division} value={division}>
                {getDivisionName(division)}
              </option>
            ))}
          </Select>

          <Select
            className="!border-ink-200"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
          >
            {divisionToCohorts[division].map((cohortName) => (
              <option key={cohortName} value={cohortName}>
                {toLabel(cohortName)}
              </option>
            ))}
          </Select>
        </Row>
      </Col>
    </Page>
  )
}
