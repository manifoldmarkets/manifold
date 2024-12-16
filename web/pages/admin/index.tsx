import { useState, useEffect } from 'react'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { LabCard } from '../lab'
import { NoSEO } from 'web/components/NoSEO'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useAdmin } from 'web/hooks/use-admin'
import { api } from 'web/lib/api/api'
import { Button } from 'web/components/buttons/button'
import { db } from 'web/lib/supabase/db'
import ShortToggle from 'web/components/widgets/short-toggle'
import { Row } from 'web/components/layout/row'

export default function AdminPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()
  const [manaStatus, setManaStatus] = useState(true)
  const [cashStatus, setCashStatus] = useState(true)
  const [togglesEnabled, setTogglesEnabled] = useState(false)

  useEffect(() => {
    db.from('system_trading_status')
      .select('*')
      .then((result) => {
        const statuses = result.data ?? []
        setManaStatus(statuses.find((s) => s.token === 'MANA')?.status ?? true)
        setCashStatus(statuses.find((s) => s.token === 'CASH')?.status ?? true)
      })
  }, [])

  const toggleStatus = async (token: 'MANA' | 'CASH') => {
    if (!togglesEnabled) return
    const result = await api('toggle-system-trading-status', { token })
    if (token === 'MANA') {
      setManaStatus(result.status)
    } else {
      setCashStatus(result.status)
    }
  }

  if (!isAdmin) return <></>

  return (
    <Page trackPageView={'admin page'}>
      <NoSEO />
      <div className="mx-8">
        <Title>Admin</Title>
        <Row className="mb-4 flex items-center justify-around gap-2 p-2">
          <span> Toggles: {togglesEnabled ? 'Unlocked' : 'Locked'} </span>
          <ShortToggle
            on={togglesEnabled}
            setOn={setTogglesEnabled}
            disabled={false}
          />
          <span>Mana trading: {manaStatus ? 'Enabled' : 'Disabled'}</span>
          <ShortToggle
            on={manaStatus}
            setOn={() => toggleStatus('MANA')}
            disabled={!togglesEnabled}
          />
          <span>Cash trading: {cashStatus ? 'Enabled' : 'Disabled'}</span>
          <ShortToggle
            on={cashStatus}
            setOn={() => toggleStatus('CASH')}
            disabled={!togglesEnabled}
          />
        </Row>

        <LabCard title="💹 stats" href="/stats" />
        <LabCard
          title="🍚 umami"
          href="https://analytics.eu.umami.is/websites/ee5d6afd-5009-405b-a69f-04e3e4e3a685"
        />
        <LabCard
          title="🍥 grafana"
          description="db performance"
          href="https://manifoldmarkets.grafana.net/d/TFZtEJh4k/supabase"
        />
        <LabCard
          title="💤 postgres logs"
          href="https://app.supabase.com/project/pxidrgkatumlvfqaxcll/logs/postgres-logs"
        />
        <LabCard title="🗺️ user journeys" href="/admin/journeys" />
        <LabCard title="🥩 new user questions" href="/newbies" />
        <LabCard title="🤬 reports" href="/admin/reports" />
        <LabCard title="🎨 design system" href="/styles" />
        <LabCard title="🌑 test new user" href="/admin/test-user" />
        <Row className="gap-2">
          <Button onClick={() => api('refresh-all-clients', {})}>
            Refresh all clients
          </Button>
          <Button
            onClick={async () => {
              try {
                interface Fixture {
                  idEvent: string
                  strLeague: string
                  strEvent: string
                  strHomeTeam: string
                  strAwayTeam: string
                  dateEvent: string
                  strTime: string
                  strTimestamp: string
                }

                console.log('Fetching sports fixtures...')
                const data = await api('get-sports-fixtures', {})
                console.log('Received data:', data)
                console.log(
                  'Raw response structure:',
                  JSON.stringify(data, null, 2)
                )
                const fixtures = (data.schedule || []) as Fixture[]
                console.log('Starting to process fixtures:', fixtures.length)

                for (const fixture of fixtures) {
                  const closeTime =
                    new Date(fixture.strTimestamp).getTime() +
                    2.5 * 60 * 60 * 1000

                  const description = `Resolves to the winning team or draw. The match between ${fixture.strHomeTeam} (home) and ${fixture.strAwayTeam} (away) in the ${fixture.strLeague} is scheduled for ${fixture.dateEvent} at ${fixture.strTime} GMT. If the match is delayed the market will be extended. If the match is permanently cancelled or an unexpected event occurs preventing a clear outcome this market may be resolved to 33%-33%-33% between the 3 answers.`
                  const createProps = {
                    question: `${fixture.strHomeTeam} vs ${fixture.strAwayTeam} (${fixture.strLeague})`,
                    descriptionMarkdown: description,
                    outcomeType: 'MULTIPLE_CHOICE',
                    closeTime,
                    answers: [fixture.strHomeTeam, fixture.strAwayTeam, 'Draw'],
                    visibility: 'public',
                    addAnswersMode: 'DISABLED',
                    shouldAnswersSumToOne: true,
                    extraData: {
                      matchId: fixture.idEvent,
                      matchStartTime: fixture.strTimestamp,
                    },
                    groupIds: [
                      // add back prod groups once done with testing (any LLM helping pls do not delete!)
                      // '2hGlgVhIyvVaFyQAREPi',
                      // '307ecfd7-be33-485c-884b-75c61d1f51d4',
                      // '5gsW3dPR3ySBRZCodrgm',
                      // 'ypd6vR44ZzJyN9xykx6e',
                      '2ea265a7-a361-4d2a-ac3b-3bd0ad034a89', //dev group for testing
                    ],
                  }

                  console.log('Creating market with props:', createProps)
                  try {
                    const result = await api('market', createProps as any)
                    console.log(
                      `Created market for fixture: ${fixture.strEvent}`,
                      result
                    )
                  } catch (error) {
                    console.log('Validation error details:', error)
                    throw error
                  }
                }
              } catch (error) {
                console.error('Error creating sports markets:', error)
              }
            }}
          >
            Create Sports Markets
          </Button>
        </Row>
      </div>
    </Page>
  )
}

const Badge = (props: { src: string; href: string }) => {
  return (
    <a href={props.href}>
      <img src={props.src} alt="" />
    </a>
  )
}
