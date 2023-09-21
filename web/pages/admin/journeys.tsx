import { NoSEO } from 'web/components/NoSEO'
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
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'

export default function Journeys() {
  const [eventsByUser, setEventsByUser] = useState<
    Record<string, rowfor<'user_events'>[]>
  >({})
  const [hoursFromNowQ, setHoursFromNowQ] = usePersistentQueryState('h', '5')
  const hoursFromNow = parseInt(hoursFromNowQ ?? '5')
  const [users, setUsers] = useState<User[]>([])
  const [bannedUsers, setBannedUsers] = useState<User[]>([])

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
  }

  const getUsers = async () => {
    const userData = await run(
      db.from('users').select('data').in('id', Object.keys(eventsByUser))
    )
    const users = userData.data.map((d) => d.data as User)
    setBannedUsers(users.filter((u) => u.isBannedFromPosting))
    setUsers(users.filter((u) => !u.isBannedFromPosting))
  }

  useEffect(() => {
    getUsers()
  }, [JSON.stringify(Object.keys(eventsByUser))])

  useEffect(() => {
    getEvents()
  }, [hoursFromNow])

  return (
    <Row>
      <NoSEO />
      <div className="text-ink-900 mx-8">
        <div className={'text-primary-700 my-1 text-2xl'}>User Journeys</div>
        <Row className={'items-center gap-2'}>
          Viewing journeys from {users.length} users ({bannedUsers.length}{' '}
          banned) created: {hoursFromNow}h ago
          <Button
            color={'indigo-outline'}
            size={'xs'}
            onClick={() => {
              setHoursFromNowQ((hoursFromNow + 1).toString())
            }}
          >
            +1h
          </Button>
        </Row>
        <Row className={'flex-wrap gap-2 scroll-auto'}>
          {Object.keys(eventsByUser).map((userId) => {
            if (bannedUsers.find((u) => u.id === userId)) return null
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
              <Col className={'mt-4 min-w-[15rem]'} key={userId}>
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
                  <li>{new Date(events[0].ts!).toLocaleString()}</li>
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
                        {name} {times > 1 ? `${times}x` : ' '}
                        {duration > 1 ? ` (${duration}s)` : ' '}
                      </li>
                    )
                  })}
                </Col>
                <ul>
                  <li>
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
