import { LovePage } from 'love/components/love-page'
import { Title } from 'web/components/widgets/title'

export default function StatsPage() {
  return (
    <LovePage trackPageView={'love stats'}>
      <Title>Amplitude Stats</Title>
      <iframe
        src="https://app.amplitude.com/analytics/share/embed/d3363bf7-6de8-4b6d-9d64-55f887e70c6d"
        width="100%"
        height="100%"
        className="border-none"
      />
    </LovePage>
  )
}
