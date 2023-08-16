import { useState, useEffect } from 'react'
import { Col } from 'web/components/layout/col'
// import { CustomAnalytics } from '../stats'
import { getStats } from 'web/lib/supabase/stats'
import { Stats } from 'common/stats'

export default function AnalyticsEmbed() {
  const [stats, setStats] = useState<Stats | undefined>(undefined)
  useEffect(() => {
    getStats().then(setStats)
  }, [])
  if (stats == null) {
    return <></>
  }
  return (
    <Col className="bg-canvas-0 w-full px-2">
      {/* <CustomAnalytics {...stats} /> */}
    </Col>
  )
}
