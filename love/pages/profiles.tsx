import Image from 'next/image'
import { useLovers } from 'love/hooks/use-lovers'
import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { LovePage } from 'love/components/love-page'
import { Filters } from 'love/components/filters'
import { useEffect, useState } from 'react'
import { buildArray } from 'common/util/array'
import { PhotosModal } from 'love/components/photos-modal'
import { calculateAge } from 'love/components/calculate-age'
import { Title } from 'web/components/widgets/title'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { Row as SupabaseRow } from 'common/supabase/utils'
import { UserIcon, PhotographIcon } from '@heroicons/react/solid'
import Link from 'next/link'

export default function ProfilesPage() {
  const allLovers = useLovers()
  const [lovers, setLovers] = useState(allLovers)
  useEffect(() => {
    if (!lovers) setLovers(allLovers)
  }, [allLovers])
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>()

  return (
    <LovePage trackPageView={'user profiles'}>
      <Col className="items-center">
        <Col className={'bg-canvas-0 w-full rounded px-6 py-4'}>
          <Title className="!mb-2 text-3xl">Profiles</Title>
          <Filters allLovers={allLovers} setLovers={setLovers} />

          {lovers === undefined ? (
            <LoadingIndicator />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {lovers.map((lover) => (
                <ProfilePreview
                  key={lover.id}
                  lover={lover}
                  setSelectedPhotos={setSelectedPhotos}
                  setShowPhotosModal={setShowPhotosModal}
                />
              ))}
            </div>
          )}
        </Col>
        <PhotosModal
          photos={selectedPhotos ?? []}
          open={showPhotosModal}
          setOpen={setShowPhotosModal}
        />
      </Col>
    </LovePage>
  )
}

function ProfilePreview(props: {
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
    <Col className="relative h-60 w-full overflow-hidden rounded text-white transition-all hover:z-40 hover:scale-110 hover:drop-shadow">
      <Link
        onClick={(e) => {
          e.stopPropagation()
        }}
        href={`/${user.username}`}
      >
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
      </Link>
      <Col className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/70 to-transparent px-4 pt-6">
        <Row>
          <Link
            onClick={(e) => {
              e.stopPropagation()
            }}
            href={`/${user.username}`}
            className="line-clamp-1 max-w-[calc(100%-2rem)] font-semibold hover:text-pink-300"
          >
            {user.name}
          </Link>
          , {calculateAge(birthdate)}
        </Row>
        <Row className="gap-1 text-xs">
          {gender} • {city}
        </Row>
      </Col>

      <Col className="absolute inset-x-0 top-0 items-end px-4 pt-2 text-xs">
        <div className="rounded-full bg-gray-600 bg-opacity-50 px-2 py-0.5">
          Active <b>{shortenedFromNow(new Date(last_online_time).getTime())}</b>
        </div>
      </Col>
      <Col
        className="absolute inset-x-0 bottom-0 cursor-pointer items-end px-4 pb-16 text-xs"
        onClick={() => {
          setSelectedPhotos(buildArray(pinned_url, photo_urls))
          setShowPhotosModal(true)
        }}
      >
        <div className="rounded-full bg-gray-600 bg-opacity-50 px-3 py-0.5">
          <PhotographIcon className="h-4 w-4 " />{' '}
        </div>
      </Col>
    </Col>
  )
}
