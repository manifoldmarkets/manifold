import { AiBenchmarkPageProps } from 'web/lib/ai/types'
import { getAiBenchmarkPageProps } from 'web/lib/ai/home'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { AIBenchmarkPage } from 'web/components/ai-benchmark/ai-benchmark-page'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const revalidate = 60

export async function getStaticProps() {
  const aiBenchmarkPageProps = await getAiBenchmarkPageProps()
  return {
    props: aiBenchmarkPageProps,
    revalidate,
  }
}

export default function AIBenchmark(props: AiBenchmarkPageProps) {
  const user = useUser()
  // mark placeholder AI contract as seen
  useSaveContractVisitsLocally(user === null, 'aiBenchmarkPlaceholderId')

  return (
    <Page trackPageView="ai benchmark page">
      <SEO
        title="Manifold AI Benchmark Forecast"
        description="Live prediction market odds on major AI benchmarks"
        image="/ai-benchmark-preview.png"
      />

      <AIBenchmarkPage {...props} />
    </Page>
  )
}
