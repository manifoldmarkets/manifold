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
import clsx from 'clsx'
import { useAdmin } from 'web/hooks/use-admin'
import { useIsAuthorized } from 'web/hooks/use-user'

const isUserLikelySpammer = (user: User, hasBet: boolean) => {
  return (
    !hasBet &&
    ((user.bio ?? '').length > 10 || (user.freeQuestionsCreated ?? 0) > 0)
  )
}

export default function Journeys() {
  const [eventsByUser, setEventsByUser] = useState<
    Record<string, rowfor<'user_events'>[]>
  >({})
  const [hoursFromNowQ, setHoursFromNowQ] = usePersistentQueryState('h', '5')
  const hoursFromNow = parseInt(hoursFromNowQ ?? '5')
  const [unBannedUsers, setUnBannedUsers] = useState<User[]>([])
  const [bannedUsers, setBannedUsers] = useState<User[]>([])
  const isAuthed = useIsAuthorized()

  const getEvents = async () => {
    const start = Date.now() - hoursFromNow * HOUR_MS
    const users = await run(
      db.from('users').select('id').gt('data->createdTime', start)
    )
    const events = await run(
      db
        .from('user_events')
        .select('*')
        .in(
          'user_id',
          users.data.map((u) => u.id)
        )
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
    setUnBannedUsers(users.filter((u) => !u.isBannedFromPosting))
  }

  useEffect(() => {
    getUsers()
  }, [JSON.stringify(Object.keys(eventsByUser))])

  useEffect(() => {
    if (!isAuthed) return
    getEvents()
  }, [hoursFromNow, isAuthed])

  const userIdsThatBet = unBannedUsers
    .filter(
      (u) => eventsByUser[u.id].filter((e) => e.name === 'bet').length > 0
    )
    .map((u) => u.id)

  const isAdmin = useAdmin()
  if (!isAdmin) return <></>

  return (
    <Row>
      <NoSEO />
      <div className="text-ink-900 mx-8">
        <div className={'text-primary-700 my-1 text-2xl'}>User Journeys</div>
        <Row className={'items-center gap-2'}>
          Viewing journeys from {unBannedUsers.length} users. You're not seeing{' '}
          {bannedUsers.length} more that are banned. Showing users created:{' '}
          {hoursFromNow}h ago.
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
        <Row>
          Fraction of users that bet:{' '}
          {(userIdsThatBet.length / unBannedUsers.length).toPrecision(2)}. If a
          user is highlighted, check if they're a spammer.
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
            const user = unBannedUsers.find((u) => u.id === userId)

            return (
              <Col className={'mt-4 min-w-[15rem]'} key={userId}>
                <Row
                  className={clsx(
                    'rounded-md p-1',
                    user &&
                      isUserLikelySpammer(user, userIdsThatBet.includes(userId))
                      ? 'bg-amber-100'
                      : ''
                  )}
                >
                  {user ? <UserAvatarAndBadge user={user} /> : userId}
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
