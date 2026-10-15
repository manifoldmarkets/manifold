import clsx from 'clsx'
import { IconType } from 'react-icons'
import { GiF1Car } from 'react-icons/gi'
import {
  MdDirectionsRun,
  MdEmojiEvents,
  MdSportsHockey,
  MdSportsMma,
} from 'react-icons/md'
import {
  TbBallAmericanFootball,
  TbBallBaseball,
  TbBallBasketball,
  TbBallFootball,
  TbBallTennis,
} from 'react-icons/tb'
import { AnySportKey } from 'common/sports-schedule'

const BALL_ICONS: Partial<Record<AnySportKey, IconType>> = {
  nfl: TbBallAmericanFootball,
  ncaaf: TbBallAmericanFootball,
  nba: TbBallBasketball,
  ncaab: TbBallBasketball,
  mlb: TbBallBaseball,
  soccer: TbBallFootball,
  tennis: TbBallTennis,
}

const SPORT_ICONS: Partial<Record<AnySportKey, IconType>> = {
  nhl: MdSportsHockey,
  f1: GiF1Car,
  mma: MdSportsMma,
  athletics: MdDirectionsRun,
}

/** Decorative sport identity using the app's existing icon library. */
export function SportHeroBackground({ sport }: { sport?: AnySportKey }) {
  const Ball = sport && BALL_ICONS[sport]
  const Icon = (sport && SPORT_ICONS[sport]) || MdEmojiEvents
  const racing = sport === 'f1'
  const positionClass =
    'text-primary-600 pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 select-none'

  if (Ball || sport === 'golf' || sport === 'cricket') {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 360 180"
        className={clsx(
          positionClass,
          'h-full max-h-44 w-full max-w-sm opacity-[0.14]'
        )}
      >
        <path
          d="M18 155C39 83 88 36 145 42C87 45 43 91 18 155Z"
          fill="currentColor"
          opacity="0.5"
        />
        <path
          d="M35 159C56 99 99 62 143 63"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
        {Ball ? (
          <Ball x="140" y="8" size={80} strokeWidth="1.25" />
        ) : (
          <svg
            x="140"
            y="8"
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="9" />
            {sport === 'cricket' ? (
              <>
                <path d="M5.6 18.4 18.4 5.6" />
                <path
                  d="M4.4 17.2 17.2 4.4M6.8 19.6 19.6 6.8"
                  strokeDasharray="1 2"
                />
              </>
            ) : (
              <g fill="currentColor" stroke="none">
                <circle cx="7" cy="12" r="0.7" />
                <circle cx="9" cy="16" r="0.7" />
                <circle cx="14" cy="17" r="0.7" />
                <circle cx="12" cy="12" r="0.7" />
                <circle cx="17" cy="13" r="0.7" />
              </g>
            )}
          </svg>
        )}
      </svg>
    )
  }

  return (
    <Icon
      // Trim the square icon's empty space above and below the car.
      {...(racing ? { viewBox: '0 165 512 180' } : {})}
      aria-hidden="true"
      focusable="false"
      className={clsx(
        positionClass,
        'opacity-[0.07]',
        racing ? 'h-24 w-56 sm:h-28 sm:w-72' : 'h-24 w-24 sm:h-28 sm:w-28'
      )}
    />
  )
}
