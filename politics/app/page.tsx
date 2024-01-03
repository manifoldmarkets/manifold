'use client'
import type { Metadata } from 'next'
import { PoliticsPage } from 'politics/components/politics-page'
import Custom404 from 'politics/app/404/page'
import { getDashboardFromSlug } from 'web/lib/firebase/api'
import { DashboardLinkItem } from 'common/dashboard'
import { FoundDashboardPage } from 'web/components/dashboard/found-dashboard-page'
import { cache } from 'react'
import { fetchLinkPreviews } from 'common/link-preview'
import {
  StateElectionMap,
  StateElectionMarket,
} from 'politics/components/usa-map/state-election-map'
import { useState } from 'react'

export const revalidate = 60 // revalidate at most in seconds
export type ElectionMode = 'presidency' | 'senate' | 'house'

export default async function Page() {
  const [mode, setMode] = useState<ElectionMode>('presidency')

  return (
    <PoliticsPage trackPageView={'home'}>
      <StateElectionMap mode={mode} />
    </PoliticsPage>
  )
}
