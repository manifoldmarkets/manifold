'use client'
import { PresidencyDashboard } from 'politics/components/home-dashboard/presidency-dashboard'
import { SenateDashboard } from 'politics/components/home-dashboard/senate-dashboard'
import { PoliticsPage } from 'politics/components/politics-page'
import { StateElectionMap } from 'politics/components/usa-map/state-election-map'
import { useState } from 'react'
import { UncontrolledTabs } from 'politics/components/layout/tabs'
import { FaUserTie } from 'react-icons/fa'
import { GiCongress } from 'react-icons/gi'

export type ElectionMode = 'presidency' | 'congress'

export default async function Page() {
  const [mode, setMode] = useState<ElectionMode>('presidency')

  const tabs = [
    {
      title: 'Presidency',
      content: <PresidencyDashboard />,
      stackedTabIcon: <FaUserTie className="h-5 w-5" />,
    },
    {
      title: 'Congress',
      content: <SenateDashboard />,
      stackedTabIcon: <GiCongress className="h-5 w-5" />,
    },
  ]
  return (
    <PoliticsPage trackPageView={'home'}>
      <UncontrolledTabs tabs={tabs} className="mb-3" />
    </PoliticsPage>
  )
}
