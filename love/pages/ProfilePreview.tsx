import Image from 'next/image'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { calculateAge } from 'love/components/calculate-age'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { Row as SupabaseRow } from 'common/supabase/utils'
import { UserIcon } from '@heroicons/react/solid'
import { IconWithInfo } from 'love/components/lover-primary-info'
import { IoLocationOutline } from 'react-icons/io5'
import { capitalizeFirstLetter } from 'web/lib/util/capitalize-first-letter'
import GenderIcon from 'love/components/GenderIcon'
import { Gender } from 'love/components/gender-icon'

export function ProfilePreview(props: {
  lover: SupabaseRow<'lovers'> & { user: User }
  setSelectedPhotos: (selectedPhotos: string[]) => void
  setShowPhotosModal: (showPhotosModal: boolean) => void
}) {
  const { lover, setSelectedPhotos, setShowPhotosModal } = props
  const {
    id,
    user,
    photo_urls,
    gender,
    birthdate,
    pinned_url,
    city,
    last_online_time,
  } = props.lover
  return (
    <Link href={`/${user.username}`}>
      <Col className="relative h-60 w-full overflow-hidden rounded text-white transition-all hover:z-40 hover:scale-110 hover:drop-shadow">
        {pinned_url ? (
          <Image
            src={pinned_url}
            fill
            alt={`${user.username}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <Col className="bg-ink-300 h-full w-full items-center justify-center">
            <UserIcon className="h-20 w-20" />
          </Col>
        )}
        <Col className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/70 to-transparent px-4 pt-6">
          <Row>
            <div className="line-clamp-1 max-w-[calc(100%-2rem)] font-semibold hover:text-pink-300">
              {user.name}
            </div>
            , {calculateAge(birthdate)}
          </Row>
          <Row className="gap-2 text-xs">
            {city} • {capitalizeFirstLetter(gender)}
          </Row>
        </Col>

        <Col className="absolute inset-x-0 top-0 items-end px-4 pt-2 text-xs">
          <div className="rounded-full bg-gray-600 bg-opacity-50 px-2 py-0.5">
            Active{' '}
            <b>{shortenedFromNow(new Date(last_online_time).getTime())}</b>
          </div>
        </Col>
        {/* <Col
            className="absolute inset-x-0 bottom-0 cursor-pointer items-end px-4 pb-16 text-xs"
            onClick={() => {
              setSelectedPhotos(buildArray(pinned_url, photo_urls))
              setShowPhotosModal(true)
            }}
          >
            <div className="rounded-full bg-gray-600 bg-opacity-50 px-3 py-0.5">
              <PhotographIcon className="h-4 w-4 " />{' '}
            </div>
          </Col> */}
      </Col>
    </Link>
  )
}
