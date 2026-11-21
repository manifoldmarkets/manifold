import { isSportsBdlEnabled } from 'common/bdl/rollout'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { NoSEO } from 'web/components/NoSEO'
import { Page } from 'web/components/layout/page'
import { useAdmin, useDev } from 'web/hooks/use-admin'

const TeamScenarios = dynamic(
  () => import('web/components/sports/gallery/team-scenarios'),
  { ssr: false }
)

export default function SportsGalleryPage() {
  const admin = useAdmin()
  const dev = useDev()
  const router = useRouter()
  const segments = router.query.sport
  const sport = Array.isArray(segments) ? segments.join('/') : segments
  return (
    <>
      <NoSEO />
      {isSportsBdlEnabled() && (admin || dev) && (
        <Page trackPageView={false}>
          <div className="mx-auto w-full max-w-4xl px-3 py-6">
            <h1 className="text-ink-900 mb-4 text-2xl font-bold">
              Sports gallery
            </h1>
            {router.isReady && <TeamScenarios sport={sport ?? 'nba'} />}
          </div>
        </Page>
      )}
    </>
  )
}
