import { PresidencyDashboard } from 'politics/components/home-dashboard/presidency-dashboard'
import { SenateDashboard } from 'politics/components/home-dashboard/senate-dashboard'
import { PoliticsPage } from 'politics/components/politics-page'
import { StateElectionMap } from 'politics/components/usa-map/state-election-map'
import { useState } from 'react'
import { UncontrolledTabs } from 'politics/components/layout/tabs'
import { FaUserTie } from 'react-icons/fa'
import { GiCongress } from 'react-icons/gi'
import { PoliticsTabs } from 'politics/components/politics-tabs'

export type ElectionMode = 'presidency' | 'congress'

export default async function Page() {
  return (
    <PoliticsPage trackPageView={'home'}>
      <PoliticsTabs />
    </PoliticsPage>
  )
}
