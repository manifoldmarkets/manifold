import { parseSportsKickoffMs } from '../sports-kickoff-interface'
import { DAY_MS, HOUR_MS } from '../util/time'
import { BDL_TENNIS_CLOSE_HOURS } from './constants'

const dayjs: typeof import('dayjs') = require('dayjs')
const utc: typeof import('dayjs/plugin/utc') = require('dayjs/plugin/utc')
const timezone: typeof import('dayjs/plugin/timezone') = require('dayjs/plugin/timezone')
dayjs.extend(utc)
dayjs.extend(timezone)

// BALLDONTLIE publishes the venue as a location string. Canadian venues alternate.
const venueZones: Record<string, string> = {
  melbourne: 'Australia/Melbourne',
  paris: 'Europe/Paris',
  london: 'Europe/London',
  wimbledon: 'Europe/London',
  'new york': 'America/New_York',
  'indian wells': 'America/Los_Angeles',
  miami: 'America/New_York',
  'monte-carlo': 'Europe/Monaco',
  madrid: 'Europe/Madrid',
  rome: 'Europe/Rome',
  toronto: 'America/Toronto',
  montreal: 'America/Toronto',
  cincinnati: 'America/New_York',
  shanghai: 'Asia/Shanghai',
  doha: 'Asia/Qatar',
  dubai: 'Asia/Dubai',
  beijing: 'Asia/Shanghai',
  wuhan: 'Asia/Shanghai',
}
export function tennisVenueZone(location: string) {
  const city = location
    .split(',')[0]
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return Object.prototype.hasOwnProperty.call(venueZones, city)
    ? venueZones[city]
    : undefined
}

export type TennisTiming = {
  venueDay: string
  startKnown: boolean
  earliestStart: number
  safetyClose: number
}
export function tennisTiming(
  scheduled: string | null | undefined,
  zone: string | undefined,
  bestOf: 3 | 5
): TennisTiming | null {
  if (!scheduled || !zone) return null
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(scheduled)
  const at = parseSportsKickoffMs(
    dateOnly ? scheduled + 'T00:00:00Z' : scheduled
  )
  if (!Number.isFinite(at)) return null
  const cap = HOUR_MS * BDL_TENNIS_CLOSE_HOURS[bestOf]
  if (!dateOnly && at % DAY_MS !== 0) {
    return {
      venueDay: dayjs(at).tz(zone).format('YYYY-MM-DD'),
      startKnown: true,
      earliestStart: at,
      safetyClose: at + cap,
    }
  }
  // A UTC midnight placeholder identifies the published calendar date at the venue.
  const venueDay = new Date(at).toISOString().slice(0, 10)
  const nextDay = new Date(at + DAY_MS).toISOString().slice(0, 10)
  const midnight = (day: string) => dayjs.tz(day + 'T00:00:00', zone).valueOf()
  return {
    venueDay,
    startKnown: false,
    earliestStart: midnight(venueDay),
    safetyClose: midnight(nextDay) + cap,
  }
}
