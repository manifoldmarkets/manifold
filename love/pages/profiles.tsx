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
import { Row as rowFor } from 'common/supabase/utils'
import { buildArray } from 'common/util/array'
import { PhotosModal } from 'love/components/photos-modal'

export default function ProfilesPage() {
  const allLovers = useLovers()
  const [lovers, setLovers] = useState(allLovers)
  useEffect(() => {
    if (!lovers) setLovers(allLovers)
  }, [allLovers])
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>()

  const applyFilters = (filters: Partial<rowFor<'lovers'>>) => {
    const filteredLovers = allLovers?.filter((lover) => {
      console.log(filters)
      if (
        filters.pref_age_min &&
        calculateAge(lover.birthdate) < filters.pref_age_min
      ) {
        return false
      } else if (
        filters.pref_age_max &&
        calculateAge(lover.birthdate) > filters.pref_age_max
      ) {
        return false
      } else if (filters.city && lover.city !== filters.city) {
        return false
      } else if (
        filters.is_smoker !== undefined &&
        lover.is_smoker !== filters.is_smoker
      ) {
        return false
      } else if (
        filters.wants_kids_strength !== undefined &&
        filters.wants_kids_strength !== -1 &&
        (filters.wants_kids_strength >= 2
          ? lover.wants_kids_strength < filters.wants_kids_strength
          : lover.wants_kids_strength > filters.wants_kids_strength)
      ) {
        return false
      } else if (
        filters.has_kids !== undefined &&
        (lover.has_kids ?? 0) < filters.has_kids
      ) {
        return false
      } else if (
        filters.pref_relation_styles !== undefined &&
        filters.pref_relation_styles.some(
          (s) => !lover.pref_relation_styles.includes(s)
        )
      ) {
        return false
      }
      return true
    })
    setLovers(filteredLovers)
    console.log(filteredLovers)
  }
  return (
    <LovePage className={'p-2'} trackPageView={'user profiles'}>
      <Col className="items-center">
        <Filters onApplyFilters={applyFilters} />

        <Col className={'bg-canvas-0  w-full overflow-x-scroll p-2'}>
          <span className="mb-4 text-3xl">Lovers</span>

          <div className="grid-cols-6 gap-4">
            {lovers === undefined ? (
              <LoadingIndicator />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th></th>
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
                              className="h-10 w-10 rounded-full"
                              width={100}
                              height={100}
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
          </div>
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

function calculateAge(birthdate: string) {
  const birthDate = new Date(birthdate)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDifference = today.getMonth() - birthDate.getMonth()

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--
  }

  return age
}
