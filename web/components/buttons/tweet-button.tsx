import clsx from 'clsx'

import { Contract } from 'common/contract'
import {
  formatMoneyNumberUSLocale,
  formatPercent,
  SWEEPIES_MONIKER,
} from 'common/util/format'
import { getShareUrl } from 'common/util/share'
import { trackCallback } from 'web/lib/service/analytics'
import { buttonClass } from './button'
import { PiXLogo } from 'react-icons/pi'

export function TweetButton(props: { tweetText: string; className?: string }) {
  const { tweetText, className } = props

  return (
    <a
      className={clsx(
        buttonClass('lg', 'none'),
        'border-ink-900 hover:bg-ink-900 hover:text-ink-50 gap-1 border-2',
        className
      )}
      href={getTweetHref(tweetText)}
      onClick={trackCallback('share tweet')}
      target="_blank"
      rel="noreferrer"
    >
      <PiXLogo width={15} height={15} />
      <div>Share</div>
    </a>
  )
}

function getTweetHref(tweetText: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText ?? ''
  )}`
}

export const getPositionTweet = (
  position: number,
  invested: number,
  contract: Contract,
  username: string
) => {
  const p = invested / Math.abs(position)
  const prob = formatPercent(position > 0 ? p : 1 - p)
  const side = position > 0 ? 'greater' : 'less'

  return `I'm predicting there's a ${side} than ${prob} chance. ${getShareUrl(
    contract,
    username
  )}`
}

export const getWinningTweet = (
  profit: number,
  contract: Contract,
  username: string
) => {
  const isCashContract = contract.token === 'CASH'
  return `I ${profit >= 0 ? 'won' : 'lost'} ${
    isCashContract ? SWEEPIES_MONIKER : 'M$'
  }${formatMoneyNumberUSLocale(profit).replace('-', '')} trading on\n'${
    contract.question
  }'! ${getShareUrl(contract, username)}`
}
