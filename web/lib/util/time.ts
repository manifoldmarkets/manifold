import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import updateLocale from 'dayjs/plugin/updateLocale'
dayjs.extend(relativeTime)

export function fromNow(time: number) {
  return dayjs(time).fromNow()
}

const FORMATTER = new Intl.DateTimeFormat('default', {
  dateStyle: 'medium',
  timeStyle: 'long',
})

export const formatTime = FORMATTER.format
