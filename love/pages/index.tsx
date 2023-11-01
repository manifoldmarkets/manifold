import Router from 'next/router'
import { UserIcon } from '@heroicons/react/solid'
import { capitalize } from 'lodash'
import { calculateAge } from 'love/components/calculate-age'
import { Filters } from 'love/components/filters'
import { Gender, convertGender } from 'love/components/gender-icon'
import { LovePage } from 'love/components/love-page'
import OnlineIcon from 'love/components/online-icon'
import { Lover } from 'love/hooks/use-lover'
import { useLovers } from 'love/hooks/use-lovers'
import Image from 'next/image'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { track } from 'web/lib/service/analytics'

export default function ProfilesPage() {
  const allLovers = useLovers()
  const [lovers, setLovers] = usePersistentInMemoryState<Lover[] | undefined>(
    undefined,
    'profile-lovers'
  )

  const user = useUser()
  if (user === undefined) return <div />

  const lover = allLovers?.find((lover) => lover.user_id === user?.id)

  return (
    <LovePage trackPageView={'user profiles'}>
      <Col className="items-center">
        <Col className={'bg-canvas-0 w-full rounded px-6 py-4'}>
          {user && allLovers && !lover && (
            <Button
              className="mb-4 lg:hidden"
              onClick={() => Router.push('signup')}
            >
              Create a profile
            </Button>
          )}
          <Title className="!mb-2 text-3xl">Profiles</Title>
          <Filters allLovers={allLovers} setLovers={setLovers} />

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
  const { user, gender, birthdate, pinned_url, city, last_online_time } =
    props.lover
  return (
    <Link
      href={`/${user.username}`}
      onClick={() => {
        track('click love profile preview')
      }}
    >
      <Col className="relative h-60 w-full overflow-hidden rounded text-white transition-all hover:z-40 hover:scale-110 hover:drop-shadow">
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
          <Row className="flex-wrap">
            <OnlineIcon last_online_time={last_online_time} className="mr-1" />
            <span className=" break-words font-semibold">
              {user.name}
            </span>, {calculateAge(birthdate)}
          </Row>
          <Row className="gap-1 text-xs">
            {city} • {capitalize(convertGender(gender as Gender))}
          </Row>
        </Col>
      </Col>
    </Link>
  )
}
