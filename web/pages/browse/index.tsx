import clsx from 'clsx'
import { Group } from 'common/group'
import { buildArray } from 'common/util/array'
import { removeEmojis } from 'common/util/string'
import { uniqBy } from 'lodash'
import { useRouter } from 'next/router'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import {
  useTrendingTopics,
  useUserTrendingTopics,
} from 'web/components/search/query-topics'
import { LoadingContractResults, Search } from 'web/components/search'
import { useBrowseDefault } from 'web/hooks/use-browse-default'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { Welcome } from 'web/components/onboarding/welcome'
import { VerificationResultModal } from 'web/components/onboarding/verification-result-modal'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { BrowseV2 } from 'web/components/browse-v2/browse-v2'
import {
  BrowseViewState,
  useBrowseView,
} from 'web/components/browse-v2/use-browse-view'
export default function BrowsePage() {
  const user = useUser()
  useSaveReferral(user)
  const browseView = useBrowseView()

  return (
    <Page trackPageView={'questions page'} className="min-w-0 lg:px-4">
      <Welcome />
      <VerificationResultModal />
      <BrowsePageContent browseView={browseView} />
    </Page>
  )
}

export function BrowsePageContent(props: { browseView: BrowseViewState }) {
  const { browseView } = props
  const user = useUser()
  if (!browseView.ready) return <LoadingContractResults />
  const isNew = browseView.view === 'new'
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-1 lg:px-0 lg:pt-3">
        {!user && (
          <div className="shrink-0 lg:hidden">
            <ManifoldLogo className="!px-0" />
          </div>
        )}
        <button
          type="button"
          onClick={() => browseView.setView(isNew ? 'legacy' : 'new')}
          aria-label={isNew ? 'Switch to classic browse' : 'Try the new browse'}
          className="text-primary-700 hover:text-primary-800 ml-auto shrink-0 py-1 text-xs font-medium"
        >
          {isNew ? (
            '← Classic'
          ) : (
            <>
              <span className="sm:hidden">Try new browse →</span>
              <span className="hidden sm:inline">Try the new browse →</span>
            </>
          )}
        </button>
      </div>
      {isNew ? <BrowseV2 /> : <LegacyBrowseContent />}
    </>
  )
}

function LegacyBrowseContent() {
  const user = useUser()
  const browseDefault = useBrowseDefault(user)
  const isMobile = useIsMobile()
  const router = useRouter()
  const { q } = router.query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q
  const privateUser = usePrivateUser()

  // const shouldFilterDestiny = useShouldBlockDestiny(user?.id)

  const trendingTopics = useTrendingTopics(
    50,
    'home-page-trending-topics'
  ) as Group[]
  const userTrendingTopics = useUserTrendingTopics(user, 25)

  const topicsByImportance = combineGroupsByImportance(
    trendingTopics ?? [],
    userTrendingTopics ?? []
  ).filter((t) => !EXCLUDED_TOPIC_SLUGS.includes(t.slug))

  const initialTopics = topicsByImportance

  if (!browseDefault.ready) return <LoadingContractResults />

  return (
    <Col className={clsx('relative col-span-8 mx-auto w-full')}>
      <Search
        key={browseDefault.persistPrefix}
        showTopicsFilterPills
        showHotTopics
        persistPrefix={browseDefault.persistPrefix}
        discoverySourceComponent="search"
        onBrowseModeChange={browseDefault.rememberMode}
        autoFocus={autoFocus}
        additionalFilter={{
          excludeContractIds: privateUser?.blockedContractIds,
          excludeGroupSlugs: buildArray(
            privateUser?.blockedGroupSlugs
            // shouldFilterDestiny &&
            //   DESTINY_GROUP_SLUG != topicSlug &&
            //   DESTINY_GROUP_SLUG
          ),
          excludeUserIds: privateUser?.blockedUserIds,
        }}
        useUrlParams
        isWholePage
        headerClassName={'pt-0 px-2'}
        defaultFilter="all"
        defaultSort="score"
        defaultForYou={browseDefault.defaultForYou}
        initialTopics={initialTopics}
      />
    </Col>
  )
}

const EXCLUDED_TOPIC_SLUGS = [
  'politics-default',
  '2024-us-presidential-election',
]

const combineGroupsByImportance = (
  resultGroups: Group[],
  myGroups: Group[]
) => {
  const combined = [
    ...myGroups,
    ...resultGroups.filter((g) => !myGroups.map((g) => g.id).includes(g.id)),
  ]

  return uniqBy(combined, (g) => removeEmojis(g.name).toLowerCase())
}
