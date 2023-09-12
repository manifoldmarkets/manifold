import { NoSEO } from 'web/components/NoSEO'
import { Title } from 'web/components/widgets/title'
import { useEffect, useState } from 'react'
import { Row as rowfor, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { HOUR_MS } from 'common/util/time'
import { groupBy, orderBy } from 'lodash'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { User } from 'common/user'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'

export default function Journeys() {
  const [eventsByUser, setEventsByUser] = useState<
    Record<string, rowfor<'user_events'>[]>
  >({})
  const [hoursFromNow, setHoursFromNow] = useState(5)
  const [users, setUsers] = useState<User[]>([])
  const getEvents = async () => {
    const events = await run(
      db.rpc('get_user_journeys' as any, {
        start_time: Date.now() - hoursFromNow * HOUR_MS,
      })
    )
    const eventsByUser = groupBy(
      orderBy(events.data as rowfor<'user_events'>[], 'ts', 'asc'),
      'user_id'
    )

    setEventsByUser(eventsByUser)
    const users = await run(
      db.from('users').select('*').in('id', Object.keys(eventsByUser))
    )
    setUsers(users.data as any as User[])
  }

  useEffect(() => {
    getEvents()
  }, [hoursFromNow])

  return (
    <Row>
      <NoSEO />
      <div className="mx-8">
        <Title>User Journeys</Title>
        <Row className={'items-center gap-2'}>
          Journeys from users created: {hoursFromNow}h ago
          <Button
            size={'xs'}
            onClick={() => {
              setHoursFromNow(hoursFromNow + 1)
            }}
          >
            +1h
          </Button>
        </Row>
        <Row className={'flex-wrap gap-2 scroll-auto'}>
          {Object.keys(eventsByUser).map((userId) => {
            const events = eventsByUser[userId]
            const eventGroups: { [key: string]: any[] } = {}
            let eventName = ''
            let groupKey = ''
            events.forEach((event, index) => {
              if (event.name !== eventName) groupKey = `${event.name}_${index}`
              if (!eventGroups[groupKey]) eventGroups[groupKey] = []
              eventGroups[groupKey].push(event)
              eventName = event.name
            })
            const user = users.find((u) => u.id === userId)

            return (
              <Col className={'mt-4 min-w-[18rem]'} key={userId}>
                <Row>
                  {user ? (
                    <UserAvatarAndBadge
                      name={user.name}
                      username={user.username}
                      avatarUrl={user.avatarUrl}
                    />
                  ) : (
                    userId
                  )}
                </Row>
                <ul>
                  <li>started: {new Date(events[0].ts!).toLocaleString()}</li>
                </ul>
                <Col>
                  {Object.values(eventGroups).map((group, index) => {
                    const name = group[0].name
                    const times = group.length
                    const timePeriod =
                      new Date(group[times - 1].ts!).valueOf() -
                      new Date(group[0].ts!).valueOf()
                    const duration = Math.round(timePeriod / 1000)

                    return (
                      <li key={index}>
                        {name} {times > 1 ? `${times} times` : ' '}
                        {duration > 1 ? ` for ${duration}s` : ' '}
                      </li>
                    )
                  })}
                </Col>
                <ul>
                  <li>
                    ended:{' '}
                    {new Date(events[events.length - 1].ts!).toLocaleString()}
                  </li>
                </ul>
              </Col>
            )
          })}
        </Row>
      </div>
    </Row>
  )
}
