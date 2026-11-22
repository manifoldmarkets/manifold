import { isSportsBdlEnabled } from 'common/bdl/rollout'
import dynamic from 'next/dynamic'
import { NoSEO } from 'web/components/NoSEO'
import { Page } from 'web/components/layout/page'
import { useAdmin, useDev } from 'web/hooks/use-admin'
const GolfScenarios = dynamic(
  () => import('web/components/sports/gallery/golf-scenarios'),
  { ssr: false }
)
export default function GolfGallery() {
  const admin = useAdmin(),
    dev = useDev()
  return (
    <>
      <NoSEO />
      {isSportsBdlEnabled() && (admin || dev) && (
        <Page trackPageView={false}>
          <div className="mx-auto w-full min-w-0 max-w-4xl px-3 py-6">
            <h1 className="text-ink-900 mb-4 text-2xl font-bold">
              Sports gallery
            </h1>
            <GolfScenarios />
          </div>
        </Page>
      )}
    </>
  )
}
