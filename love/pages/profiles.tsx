import Image from 'next/image'
import clsx from 'clsx'

import { useLovers } from 'love/hooks/use-lovers'
import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Table } from 'web/components/widgets/table'
import { fromNow } from 'web/lib/util/time'

export default function ProfilesPage() {
  const lovers = useLovers()

  return (
    <Col className="items-center">
      <Col className={'bg-canvas-0 w-full max-w-4xl px-6 py-4'}>
        <Col className="-4">
          <h1 className="mb-4 text-3xl">Lovers</h1>

          <div className="grid-cols-9 gap-4">
            {lovers === undefined ? (
              <LoadingIndicator />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Gender</th>
                    <th>Interested in</th>
                    <th>Age</th>
                    <th>Location</th>
                    <th>Ethnicity</th>
                    <th>Last online</th>
                  </tr>
                </thead>
                {lovers.map(
                  ({
                    id,
                    user,
                    photo_urls,
                    gender,
                    pref_gender,
                    birthdate,
                    city,
                    ethnicity,
                    last_online_time,
                  }) => (
                    <tr key={id} className={clsx()}>
                      <td>
                        {photo_urls && photo_urls[0] && (
                          <Image
                            className="h-12 w-12 rounded-full"
                            alt={photo_urls[0]}
                            src={photo_urls[0]}
                          />
                        )}
                      </td>
                      <td>{user.name}</td>
                      <td>{gender}</td>
                      <td>{pref_gender}</td>
                      <td>{calculateAge(birthdate)}</td>
                      <td>{city}</td>
                      <td>{ethnicity}</td>
                      <td>{fromNow(new Date(last_online_time).getTime())}</td>
                    </tr>
                  )
                )}
              </Table>
            )}
          </div>
        </Col>
      </Col>
    </Col>
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
