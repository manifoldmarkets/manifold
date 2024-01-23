import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import Router from 'next/router'
import { MultiContract, contractPath } from 'common/contract'
import { ContractCardView } from 'common/events'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { DEBUG_FEED_CARDS, FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { track } from 'web/lib/service/analytics'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { Spacer } from 'web/components/layout/spacer'
import { PartyPanel } from './party-panel/party-panel'

export function PoliticsPartyCard(props: {
  contract: MultiContract
  children?: React.ReactNode
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  item?: FeedTimelineItem
  className?: string
  customTitle?: string
  titleSize?: 'lg'
  maxAnswers?: number
}) {
  const {
    promotedData,
    trackingPostfix,
    item,
    customTitle,
    titleSize,
    className,
    maxAnswers,
  } = props

  const contract =
    (useFirebasePublicContract(
      props.contract.visibility,
      props.contract.id
    ) as MultiContract) ?? props.contract

  if (contract.mechanism === 'cpmm-multi-1') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const answers = useAnswersCpmm(contract.id)
    if (answers) {
      contract.answers = answers
    }
  }
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
    <ClickFrame
      className={clsx(
        className,
        'relative rounded-xl',
        'cursor-pointer ',
        'fade-in group'
      )}
      onClick={(e) => {
        trackClick()
        Router.push(path)
        e.currentTarget.focus() // focus the div like a button, for style
      }}
      ref={ref}
    >
      <Link
        className={clsx(
          'group-hover:text-primary-700 grow items-start text-sm font-semibold transition-colors sm:text-lg',
          titleSize === 'lg' && ' sm:text-3xl'
        )}
        href={path}
        onClick={trackClick}
      >
        {contract.question}
      </Link>
      <Spacer h={4} />
      <PartyPanel contract={contract} maxAnswers={maxAnswers ?? 6} />
    </ClickFrame>
  )
}
