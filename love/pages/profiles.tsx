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
        <Col className={'bg-canvas-0 w-full px-6 py-4 rounded'}>
          <Title className="!mb-2 text-3xl">Profiles</Title>
          <Filters allLovers={allLovers} setLovers={setLovers} />

          <Col className=" grid-cols-6 gap-4 overflow-x-scroll">
            {lovers === undefined ? (
              <LoadingIndicator />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Name</th>
                    <th>Gender</th>
                    <th>Age</th>
                    <th>Location</th>
                    <th>Last online</th>
                  </tr>
                </thead>
                {lovers.map(
                  ({
                    id,
                    user,
                    photo_urls,
                    gender,
                    birthdate,
                    pinned_url,
                    city,
                    last_online_time,
                  }) => (
                    <tr key={id} className={clsx()}>
                      <td>
                        {pinned_url && (
                          <div
                            className={clsx(
                              'relative cursor-pointer rounded-md  p-2',
                              'hover:border-teal-900'
                            )}
                            onClick={() => {
                              setSelectedPhotos(
                                buildArray(pinned_url, photo_urls)
                              )
                              setShowPhotosModal(true)
                            }}
                          >
                            <Image
                              className="h-5 w-5 rounded-full"
                              height={20}
                              width={20}
                              alt={pinned_url}
                              src={pinned_url}
                            />
                          </div>
                        )}
                      </td>
                      <td>
                        <UserLink name={user.name} username={user.username} />
                      </td>
                      <td>{gender}</td>
                      <td>{calculateAge(birthdate)}</td>
                      <td>{city}</td>
                      <td>{fromNow(new Date(last_online_time).getTime())}</td>
                    </tr>
                  )
                )}
              </Table>
            )}
          </Col>
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
