import { useState, useEffect } from 'react'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { DailyChart } from 'web/components/charts/stats'
import { Button } from '../buttons/button'
import { Tabs } from '../layout/tabs'

export function KYCStats() {
  const { data: kycStats, refresh } = useAPIGetter('get-kyc-stats', {})

  const [initialVerifications, setInitialVerifications] = useState<
    { x: string; y: number }[]
  >([])
  const [phoneVerifications, setPhoneVerifications] = useState<
    { x: string; y: number }[]
  >([])

  useEffect(() => {
    if (kycStats) {
      setInitialVerifications(
        kycStats.initialVerifications.map((item: any) => ({
          x: item.day,
          y: item.count,
        }))
      )
      setPhoneVerifications(
        kycStats.phoneVerifications.map((item: any) => ({
          x: item.day,
          y: item.count,
        }))
      )
    }
  }, [kycStats])

  return (
    <>
      <Row className="items-start justify-between">
        <Title>KYC Statistics</Title>
        <Button onClick={refresh}>Refresh</Button>
      </Row>

      <Tabs
        className="mb-4"
        tabs={[
          {
            title: '# Verification Bonuses',
            content: <DailyChart values={initialVerifications} />,
          },
          {
            title: 'Phone Verifications',
            content: <DailyChart values={phoneVerifications} />,
          },
        ]}
      />
    </>
  )
}
