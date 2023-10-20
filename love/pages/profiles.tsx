import Image from 'next/image'
import clsx from 'clsx'

import { useLovers } from 'love/hooks/use-lovers'
import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Table } from 'web/components/widgets/table'
import { fromNow } from 'web/lib/util/time'
import { UserLink } from 'web/components/widgets/user-link'
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
    <Col
      className="relative h-60 w-full overflow-hidden rounded text-white transition-all hover:z-40 hover:scale-110 hover:drop-shadow"
      onClick={() => {
        setSelectedPhotos(buildArray(pinned_url, photo_urls))
        setShowPhotosModal(true)
      }}
    >
      <Image
        src={pinned_url ?? ''}
        fill
        alt={`preview`}
        className="h-full w-full object-cover"
      />
      <Col className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/70 to-transparent px-4 pt-6">
        <Row>
          <div className="line-clamp-1 max-w-[calc(100%-2rem)] font-semibold">
            {user.name}
          </div>
          , {calculateAge(birthdate)}
        </Row>
        <Row className="gap-1 text-xs">
          {gender} • {city}
        </Row>
      </Col>

      <Row className="absolute inset-x-0 top-0 justify-end px-4 pt-2 text-xs">
        <span className="rounded-full bg-gray-600 bg-opacity-50 px-2 py-0.5">
          Active <b>{shortenedFromNow(new Date(last_online_time).getTime())}</b>
        </span>
      </Row>
    </Col>
  )
}
