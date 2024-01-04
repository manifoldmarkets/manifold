'use client'

import { PresidencyDashboard } from './home-dashboard/presidency-dashboard'
import { SenateDashboard } from './home-dashboard/senate-dashboard'
import { UncontrolledTabs } from './layout/tabs'
import { ElectionMode } from './usa-map/state-election-map'
import { FaUserTie } from 'react-icons/fa'
import { GiCongress } from 'react-icons/gi'
import { useState } from 'react'

export function PoliticsTabs() {
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
  return <UncontrolledTabs tabs={tabs} className="mb-3" />
}
