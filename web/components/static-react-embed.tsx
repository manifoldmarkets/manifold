import { useState, useEffect } from 'react'
import { MidtermsMaps } from './usa-map/midterms-maps'

export function StaticReactEmbed(props: { embedName: string }) {
  const { embedName } = props
  const [embed, setEmbed] = useState<JSX.Element | null>(null)

  useEffect(() => {
    const governorMidtermsMap = <MidtermsMaps mapType="governor" />
    const senateMidtermsMap = <MidtermsMaps mapType="senate" />

    if (embedName === 'governor-midterms-map') {
      setEmbed(governorMidtermsMap)
    } else if (embedName === 'senate-midterms-map') {
      setEmbed(senateMidtermsMap)
    }
  }, [embedName, setEmbed])

  return <div>{embed}</div>
}
