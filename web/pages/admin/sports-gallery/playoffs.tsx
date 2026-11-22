import { isSportsBdlEnabled } from 'common/bdl/rollout'
import dynamic from 'next/dynamic'
import { NoSEO } from 'web/components/NoSEO'
import { Page } from 'web/components/layout/page'
import { useAdmin, useDev } from 'web/hooks/use-admin'
const Scenarios = dynamic(
  () => import('web/components/sports/gallery/playoff-scenarios'),
  { ssr: false }
)
export default function PlayoffGallery() {
  const admin = useAdmin(),
    dev = useDev()
  return (
    <>
      <NoSEO />
      {isSportsBdlEnabled() && (admin || dev) && (
        <Page trackPageView={false}>
          <main className="mx-auto w-full min-w-0 max-w-4xl space-y-4 px-3 py-6">
            <h1 className="text-ink-900 text-2xl font-bold">Sports gallery</h1>
            <Scenarios />
          </main>
        </Page>
      )}
    </>
  )
}
