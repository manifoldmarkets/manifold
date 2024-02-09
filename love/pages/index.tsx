import { UserIcon, ExternalLinkIcon } from '@heroicons/react/solid'
import { capitalize } from 'lodash'
import Image from 'next/image'
import Link from 'next/link'
import Router from 'next/router'

import { Search } from 'love/components/filters/search'
import { Gender, convertGender } from 'love/components/gender-icon'
import { LovePage } from 'love/components/love-page'
import { SignUpAsMatchmaker } from 'love/components/nav/love-sidebar'
import OnlineIcon from 'love/components/online-icon'
import { useLover } from 'love/hooks/use-lover'
import { useCompatibleLovers } from 'love/hooks/use-lovers'
import { signupThenMaybeRedirectToSignup } from 'love/lib/util/signup'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { Lover } from 'common/love/lover'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useTracking } from 'web/hooks/use-tracking'
import { useCallReferUser } from 'web/hooks/use-call-refer-user'
import { CompatibilityScore } from 'common/love/compatibility-score'
import { CompatibleBadge } from 'love/components/widgets/compatible-badge'
import { useGetter } from 'web/hooks/use-getter'
import { getStars } from 'love/lib/supabase/stars'
import { StarButton } from 'love/components/widgets/star-button'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export default function ProfilesPage() {
  const { data: loversResult } = useAPIGetter('get-lovers', {})
  const allLovers = loversResult?.lovers

  const [lovers, setLovers] = usePersistentInMemoryState<Lover[] | undefined>(
    undefined,
    'profile-lovers'
  )
  const [isSearching, setIsSearching] = usePersistentInMemoryState<boolean>(
    false,
    'profile-is-searching'
  )

  const user = useUser()
  useTracking('view love profiles')
  useSaveReferral(user)
  useSaveCampaign()
  useCallReferUser()
  const lover = useLover()
  const { data: starredUserIds, refresh: refreshStars } = useGetter(
    'star',
    user?.id,
    getStars
  )

  const compatibleLovers = useCompatibleLovers(user ? user.id : user)

  if (user === undefined) return <div />

  return (
    <LovePage trackPageView={'user profiles'}>
      <Col className="items-center">
        <Col className={'bg-canvas-0 w-full rounded px-3 py-4 sm:px-6'}>
          {user && allLovers && !lover && (
            <Button
              className="mb-4 lg:hidden"
              onClick={() => Router.push('signup')}
            >
              Create a profile
            </Button>
          )}
          {user === null && (
            <Col className="mb-4 gap-2 lg:hidden">
              <Button
                className="flex-1"
                color="gradient"
                size="xl"
                onClick={signupThenMaybeRedirectToSignup}
              >
                Sign up
              </Button>
              <SignUpAsMatchmaker className="flex-1" />
            </Col>
          )}
          {user && allLovers && lover && (
            <Button
              className="mb-4"
              color="indigo-outline"
              onClick={() => Router.push('/markets')}
            >
              New! Browse markets
            </Button>
          )}
          <Title className="!mb-2 text-3xl">Profiles</Title>
          <Search
            allLovers={allLovers}
            setLovers={setLovers}
            setIsSearching={setIsSearching}
            youLover={lover}
            loverCompatibilityScores={
              compatibleLovers?.loverCompatibilityScores
            }
            starredUserIds={starredUserIds ?? []}
          />

          {lovers === undefined || compatibleLovers === undefined ? (
            <LoadingIndicator />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {!isSearching && lovers.length > 1400 && (
                <BetOnLovePromo key="betonlove" />
              )}

              {lovers.map((lover) => (
                <ProfilePreview
                  key={lover.id}
                  lover={lover}
                  compatibilityScore={
                    compatibleLovers
                      ? compatibleLovers.loverCompatibilityScores[lover.user_id]
                      : undefined
                  }
                  hasStar={
                    !!starredUserIds && starredUserIds.includes(lover.user_id)
                  }
                  refreshStars={refreshStars}
                />
              ))}
            </div>
          )}
        </Col>
      </Col>
    </LovePage>
  )
}

function ProfilePreview(props: {
  lover: Lover
  compatibilityScore: CompatibilityScore | undefined
  hasStar: boolean
  refreshStars: () => Promise<void>
}) {
  const { lover, compatibilityScore, hasStar, refreshStars } = props
  const { user, gender, age, pinned_url, city, last_online_time } = lover
  const currentUser = useUser()

  return (
    <Link
      href={`/${user.username}`}
      onClick={() => {
        track('click love profile preview')
      }}
    >
      <Col className="relative h-60 w-full overflow-hidden rounded text-white transition-all hover:z-20 hover:scale-110 hover:drop-shadow">
        {pinned_url ? (
          <Image
            src={pinned_url}
            // You must set these so we don't pay an extra $1k/month to vercel
            width={180}
            height={240}
            alt={`${user.username}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <Col className="bg-ink-300 h-full w-full items-center justify-center">
            <UserIcon className="h-20 w-20" />
          </Col>
        )}

        <Row className="absolute inset-x-0 right-0 top-0 items-start justify-between bg-gradient-to-b from-black/70 via-black/70 to-transparent px-2 pb-3 pt-2">
          {currentUser ? (
            <StarButton
              className="!pt-0"
              isStarred={hasStar}
              refresh={refreshStars}
              targetLover={lover}
              hideTooltip
            />
          ) : (
            <div />
          )}
          {compatibilityScore && (
            <CompatibleBadge compatibility={compatibilityScore} />
          )}
        </Row>

        <Col className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/70 to-transparent px-4 pb-2 pt-6">
          <div>
            <div className="flex flex-wrap items-center gap-x-1">
              <OnlineIcon last_online_time={last_online_time} />
              <span>
                <span className="break-words font-semibold">{user.name}</span>,
              </span>
              {age}
            </div>
          </div>
          <Row className="gap-1 text-xs">
            {city} • {capitalize(convertGender(gender as Gender))}
          </Row>
        </Col>
      </Col>
    </Link>
  )
}

function BetOnLovePromo() {
  return (
    <Link
      href={
        'https://lu.ma/betonlove?utm_source=love&utm_medium=web&utm_campaign=betonlove'
      }
    >
      <Col className="relative h-60 w-full overflow-hidden rounded text-white transition-all hover:z-20 hover:scale-110 hover:drop-shadow">
        <Image
          src="/betonlove-big.webp"
          width={180}
          height={240}
          alt={`Bet on Love`}
          className="h-full w-full object-cover"
        />

        <Col className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/70 to-transparent px-4 pb-2 pt-6">
          <div>
            <div className="flex flex-wrap items-center gap-x-1">
              <OnlineIcon last_online_time={'now'} />
              <span>
                <span className="break-words font-semibold">
                  Bet on Love{' '}
                  <ExternalLinkIcon className="inline-block h-4 w-4" />
                </span>
              </span>
            </div>
          </div>
          <Row className="gap-1 text-xs">San Francisco • Dating show</Row>
        </Col>
      </Col>
    </Link>
  )
}
