import { UserIcon } from '@heroicons/react/solid'
import { capitalize } from 'lodash'
import { Search } from 'love/components/filters/search'
import { Gender, convertGender } from 'love/components/gender-icon'
import { LovePage } from 'love/components/love-page'
import { SignUpAsMatchmaker } from 'love/components/nav/love-sidebar'
import OnlineIcon from 'love/components/online-icon'
import { useLover } from 'love/hooks/use-lover'
import { useLovers } from 'love/hooks/use-lovers'
import { signupThenMaybeRedirectToSignup } from 'love/lib/util/signup'
import Image from 'next/image'
import Link from 'next/link'
import Router from 'next/router'
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

export default function ProfilesPage() {
  const allLovers = useLovers()
  const [lovers, setLovers] = usePersistentInMemoryState<Lover[] | undefined>(
    undefined,
    'profile-lovers'
  )

  const user = useUser()
  useTracking('view love profiles')
  useSaveReferral(user)
  useSaveCampaign()
  useCallReferUser()
  const lover = useLover()

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
                Create a profile
              </Button>
              <SignUpAsMatchmaker className="flex-1" />
            </Col>
          )}
          <Title className="!mb-2 text-3xl">Profiles</Title>
          <Search
            allLovers={allLovers}
            setLovers={setLovers}
            youLover={lover}
          />

          {lovers === undefined ? (
            <LoadingIndicator />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {lovers.map((lover) => (
                <ProfilePreview key={lover.id} lover={lover} />
              ))}
            </div>
          )}
        </Col>
      </Col>
    </LovePage>
  )
}

function ProfilePreview(props: { lover: Lover }) {
  const { user, gender, age, pinned_url, city, last_online_time } = props.lover
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
