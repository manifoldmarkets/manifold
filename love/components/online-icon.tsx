import clsx from 'clsx'
import dayjs from 'dayjs'
import { Row } from 'web/components/layout/row'
import {
  shortenedDuration,
  shortenedFromNow,
} from 'web/lib/util/shortenedFromNow'

export default function OnlineIcon(props: {
  last_online_time: string
  alwaysDarkMode?: boolean
}) {
  const { last_online_time, alwaysDarkMode } = props
  const lastOnlineTime = dayjs(last_online_time)
  const currentTime = dayjs()

  // Calculate the time difference as a duration
  const diff = dayjs.duration(Math.abs(currentTime.diff(lastOnlineTime)))

  const STALLED_CUTOFF = 15
  const INACTIVE_HOURS = 12

  // Check if last online time was more than 30 minutes ago and more than one day ago
  const isStalled = diff.asMinutes() > STALLED_CUTOFF
  const isInactive = diff.asHours() > INACTIVE_HOURS

  return (
    <Row
      className={clsx(
        'h-fit items-center rounded-full px-1.5 text-xs font-semibold',
        isInactive
          ? alwaysDarkMode
            ? 'bg-gray-600/70'
            : 'bg-gray-300/70 dark:bg-gray-600/70 '
          : isStalled
          ? alwaysDarkMode
            ? 'bg-yellow-500/70'
            : 'bg-yellow-200/70 dark:bg-yellow-400/70'
          : alwaysDarkMode
          ? 'bg-green-500/70'
          : 'bg-green-300/80 dark:bg-green-500/70'
      )}
    >
      {shortenedDuration(diff)}
    </Row>
  )
}
