import { useState, useEffect } from 'react'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { CustomAnalytics, FirebaseAnalytics } from '../stats'
import { getStats } from 'web/lib/firebase/stats'
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
    <Col className="w-full bg-white px-2">
      <CustomAnalytics {...stats} />
      <Spacer h={8} />
      <FirebaseAnalytics />
    </Col>
  )
}
