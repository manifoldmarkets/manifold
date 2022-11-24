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

dayjs.extend(updateLocale)
dayjs.updateLocale('en', {
  relativeTime: {
    future: 'in %s',
    past: '%s',
    s: 'now',
    m: '1m',
    mm: '%dm',
    h: '1h',
    hh: '%dh',
    d: '1d',
    dd: '%dd',
    M: '1M',
    MM: '%dM',
    y: '1y',
    yy: '%dy',
  },
})
