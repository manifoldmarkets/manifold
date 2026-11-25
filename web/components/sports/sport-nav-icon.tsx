import type { IconType } from 'react-icons'
import {
  TbBallAmericanFootball,
  TbBallBaseball,
  TbBallBasketball,
  TbBallFootball,
  TbBallTennis,
  TbBike,
  TbCricket,
  TbDeviceGamepad2,
  TbFlag,
  TbGolf,
  TbIceSkating,
  TbKarate,
  TbLayoutGrid,
  TbPlayHandball,
  TbTrophy,
} from 'react-icons/tb'

const icons = new Map<string, IconType>([
  ['all', TbLayoutGrid],
  ['afl', TbBallAmericanFootball],
  ['baseball', TbBallBaseball],
  ['basketball', TbBallBasketball],
  ['cricket', TbCricket],
  ['cycling', TbBike],
  ['esports', TbDeviceGamepad2],
  ['football', TbBallAmericanFootball],
  ['golf', TbGolf],
  ['handball', TbPlayHandball],
  ['hockey', TbIceSkating],
  ['mma', TbKarate],
  ['nrl', TbBallAmericanFootball],
  ['racing', TbFlag],
  ['soccer', TbBallFootball],
  ['tennis', TbBallTennis],
])

export function SportNavIcon({ sport }: { sport: string }) {
  const Icon = icons.get(sport) ?? TbTrophy
  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      strokeWidth={1.7}
      className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]"
    />
  )
}
