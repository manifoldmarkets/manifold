import clsx from 'clsx'
import { MultiContract, contractPath } from 'common/contract'
import Link from 'next/link'
import Router from 'next/router'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { track } from 'web/lib/service/analytics'
import { CandidatePanel } from './candidates-panel/candidates-panel'
import { SmallCandidatePanel } from './candidates-panel/small-candidate-panel'
import { PartyPanel } from './party-panel/party-panel'

export function PoliticsCard(props: {
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
  viewType: 'PARTY' | 'CANDIDATE' | 'STATE' | 'SMALL CANDIDATE'
}) {
  const {
    promotedData,
    trackingPostfix,
    item,
    customTitle,
    titleSize,
    className,
    maxAnswers,
    viewType,
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

  const path = contractPath(contract)

  const trackClick = () =>
    track(('click politics market card ' + trackingPostfix).trim(), {
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

  if (viewType == 'PARTY') {
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
        <PartyPanel contract={contract} maxAnswers={maxAnswers ?? 2} />
      </ClickFrame>
    )
  }
  if (viewType == 'CANDIDATE') {
    return (
      <Col className={'group w-full flex-col gap-1.5 '}>
        {/* Title is link to contract for open in new tab and a11y */}
        <Link
          className={clsx(
            'group-hover:text-primary-700 grow items-start font-semibold transition-colors sm:text-lg',
            titleSize === 'lg' && ' sm:text-3xl'
          )}
          href={path}
          onClick={trackClick}
        >
          <VisibilityIcon contract={contract} />{' '}
          {customTitle ? customTitle : extractPhrase(contract.question)}
        </Link>
        <CandidatePanel contract={contract} maxAnswers={6} />
      </Col>
    )
  }
  if (viewType == 'SMALL CANDIDATE') {
    return (
      <ClickFrame
        className={clsx(
          className,
          'relative rounded-xl',
          'cursor-pointer ',
          'fade-in group',
          'bg-canvas-0 px-4 py-2'
        )}
        onClick={(e) => {
          trackClick()
          Router.push(path)
          e.currentTarget.focus() // focus the div like a button, for style
        }}
      >
        <Link
          className={clsx(
            'group-hover:text-primary-700 grow items-start text-sm font-semibold transition-colors sm:text-lg',
            titleSize === 'lg' && ' sm:text-3xl'
          )}
          href={path}
          onClick={trackClick}
        >
          {customTitle ?? contract.question}
        </Link>
        <Spacer h={4} />
        <SmallCandidatePanel contract={contract} maxAnswers={maxAnswers ?? 6} />
      </ClickFrame>
    )
  }
  return <></>
}
