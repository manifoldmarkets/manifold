import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { ConfirmationButton } from 'web/components/buttons/confirmation-button'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { NoSEO } from 'web/components/NoSEO'
import ShortToggle from 'web/components/widgets/short-toggle'
import { Title } from 'web/components/widgets/title'
import { useAdmin } from 'web/hooks/use-admin'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { handleCreateSportsMarkets } from 'web/lib/admin/create-sports-markets'
import { api } from 'web/lib/api/api'
import { db } from 'web/lib/supabase/db'
import { LabCard } from '../lab'

export default function AdminPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()
  const [manaStatus, setManaStatus] = useState(true)
  const [cashStatus, setCashStatus] = useState(true)
  const [loanStatus, setLoanStatus] = useState(true)
  const [togglesEnabled, setTogglesEnabled] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [isFinished, setIsFinished] = useState(false)

  useEffect(() => {
    db.from('system_trading_status')
      .select('*')
      .then((result) => {
        const statuses = result.data ?? []
        setManaStatus(statuses.find((s) => s.token === 'MANA')?.status ?? true)
        setCashStatus(statuses.find((s) => s.token === 'CASH')?.status ?? true)
        setLoanStatus(statuses.find((s) => s.token === 'LOAN')?.status ?? true)
      })
  }, [])

  const toggleStatus = async (token: 'MANA' | 'CASH' | 'LOAN') => {
    if (!togglesEnabled) return
    const result = await api('toggle-system-trading-status', { token })
    if (token === 'MANA') {
      setManaStatus(result.status)
    } else if (token === 'CASH') {
      setCashStatus(result.status)
    } else {
      setLoanStatus(result.status)
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
          <span>Loans: {loanStatus ? 'Enabled' : 'Disabled'}</span>
          <ShortToggle
            on={loanStatus}
            setOn={() => toggleStatus('LOAN')}
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
        <LabCard title="👕 merch management" href="/admin/merch" />
        <LabCard title="🎨 design system" href="/styles" />
        <LabCard title="🌑 test new user" href="/admin/test-user" />
        <LabCard title="👤 update user" href="/admin/update-user" />
        <LabCard
          title="👤 user info & account management"
          href="/admin/user-info"
        />
        <Row className="gap-2">
          <Button onClick={() => api('refresh-all-clients', {})}>
            Refresh all clients
          </Button>
          <ConfirmationButton
            openModalBtn={{
              label: isLoading ? 'Creating...' : 'Create Sports Markets',
              disabled: isLoading,
            }}
            submitBtn={{
              label: 'Create',
              isSubmitting: isLoading,
              color: 'green',
            }}
            onSubmit={() =>
              handleCreateSportsMarkets(setIsLoading, setIsFinished)
            }
          >
            <p>Are you sure you want to create new sports markets?</p>
            <p>
              Make sure you are logged into the Manifold account and have
              ~50,000 mana.
            </p>
          </ConfirmationButton>
          {isFinished && (
            <div className="mt-4 text-green-600">
              ✅ Sports markets created successfully!
            </div>
          )}
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
