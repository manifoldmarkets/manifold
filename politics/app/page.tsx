'use client'
import { PoliticsPage } from 'politics/components/politics-page'
import { StateElectionMap } from 'politics/components/usa-map/state-election-map'
import { useState } from 'react'

export type ElectionMode = 'presidency' | 'senate' | 'house'

export default async function Page() {
  const [mode, setMode] = useState<ElectionMode>('presidency')

  return (
    <PoliticsPage trackPageView={'home'}>
      <StateElectionMap mode={mode} />
    </PoliticsPage>
  )
}
