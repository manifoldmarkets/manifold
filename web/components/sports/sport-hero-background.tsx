import clsx from 'clsx'
import { IconType } from 'react-icons'
import { GiF1Car } from 'react-icons/gi'
import {
  MdDirectionsRun,
  MdEmojiEvents,
  MdSportsBaseball,
  MdSportsBasketball,
  MdSportsCricket,
  MdSportsFootball,
  MdSportsGolf,
  MdSportsHockey,
  MdSportsMma,
  MdSportsSoccer,
  MdSportsTennis,
} from 'react-icons/md'
import { AnySportKey } from 'common/sports-schedule'

const SPORT_ICONS: Partial<Record<AnySportKey, IconType>> = {
  nfl: MdSportsFootball,
  ncaaf: MdSportsFootball,
  nba: MdSportsBasketball,
  ncaab: MdSportsBasketball,
  mlb: MdSportsBaseball,
  nhl: MdSportsHockey,
  soccer: MdSportsSoccer,
  tennis: MdSportsTennis,
  f1: GiF1Car,
  mma: MdSportsMma,
  golf: MdSportsGolf,
  cricket: MdSportsCricket,
  athletics: MdDirectionsRun,
}

/** Decorative sport identity using the app's existing icon library. */
export function SportHeroBackground({ sport }: { sport?: AnySportKey }) {
  const Icon = (sport && SPORT_ICONS[sport]) || MdEmojiEvents
  const racing = sport === 'f1'
  return (
    <Icon
      // Trim the square icon's empty space above and below the car.
      {...(racing ? { viewBox: '0 165 512 180' } : {})}
      aria-hidden="true"
      focusable="false"
      className={clsx(
        'text-primary-600 pointer-events-none absolute bottom-0 right-3 -z-10 select-none opacity-[0.06] sm:right-5 sm:opacity-[0.09]',
        racing ? 'h-24 w-56 sm:h-28 sm:w-72' : 'h-24 w-24 sm:h-28 sm:w-28'
      )}
    />
  )
}
