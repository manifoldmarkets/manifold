import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'
import { useEffect, useState } from 'react'

import { AD_WAIT_SECONDS } from 'common/boost'
import { MultiContract, contractPath } from 'common/contract'
import { ContractCardView } from 'common/events'
import {
  ContractStatusLabel,
  VisibilityIcon,
} from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { useAdTimer } from 'web/hooks/use-ad-timer'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { DEBUG_FEED_CARDS, FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { getAdCanPayFunds } from 'web/lib/supabase/ads'
import { getMarketMovementInfo } from 'web/lib/supabase/feed-timeline/feed-market-movement-display'
import { CandidatePanel } from './candidates-panel/candidates-panel'

export function CandidateCard(props: {
  contract: MultiContract
  children?: React.ReactNode
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  item?: FeedTimelineItem
  className?: string
  customTitle?: string
  titleSize?: 'lg'
}) {
  const { promotedData, trackingPostfix, item, customTitle, titleSize } = props

  const contract =
    (useFirebasePublicContract(
      props.contract.visibility,
      props.contract.id
    ) as MultiContract) ?? props.contract

  const { closeTime } = contract

  const isClosed = closeTime && closeTime < Date.now()
  const path = contractPath(contract)
  const metrics = useSavedContractMetrics(contract)

  // Note: if we ever make cards taller than viewport, we'll need to pass a lower threshold to the useIsVisible hook

  const [visible, setVisible] = useState(false)
  const { ref } = useIsVisible(
    () => {
      !DEBUG_FEED_CARDS &&
        track('view market card', {
          contractId: contract.id,
          creatorId: contract.creatorId,
          slug: contract.slug,
          feedId: item?.id,
          isPromoted: !!promotedData,
        } as ContractCardView)
      setVisible(true)
    },
    false,
    true,
    () => {
      setVisible(false)
    }
  )

  const trackClick = () =>
    track(('click market card ' + trackingPostfix).trim(), {
      contractId: contract.id,
      creatorId: contract.creatorId,
      slug: contract.slug,
      feedId: item?.id,
      isPromoted: !!promotedData,
    })

  function extractPhrase(inputString: string): string | null {
    const regex = /Who will win the (.+?)\?/
    const match = regex.exec(inputString)

    if (match && match[1]) {
      return match[1] // This is the extracted phrase.
    } else {
      return null // No match found.
    }
  }

  return (
    <Col className={'w-full flex-col gap-1.5 '}>
      <div
        className={clsx(
          'flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4'
        )}
      >
        {/* Title is link to contract for open in new tab and a11y */}
        <Link
          className={clsx(
            'hover:text-primary-700 grow items-start font-semibold transition-colors sm:text-lg',
            titleSize === 'lg' && ' sm:text-3xl'
          )}
          href={path}
          onClick={trackClick}
        >
          <VisibilityIcon contract={contract} />{' '}
          {customTitle ? customTitle : extractPhrase(contract.question)}
        </Link>
      </div>
      <CandidatePanel contract={contract} maxAnswers={6} />
    </Col>
  )
}
