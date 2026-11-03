import clsx from 'clsx'
import { useState } from 'react'
import Link from 'next/link'
import Router from 'next/router'

import { Contract, isMultiCpmm, tradingAllowed } from 'common/contract'
import {
  formatPrice as formatPerpPrice,
  inferPriceDecimals as inferPerpPriceDecimals,
} from 'common/perps/format'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { BinaryResolutionOrChance } from 'web/components/contract/contract-price'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { useAdminOrMod } from 'web/hooks/use-admin'
import {
  BinaryBetPanel,
  SimpleMultiOverview,
} from 'web/components/contract/contract-overview'
import { ScheduleItem } from './tv-schedule'
import { ScheduleTVModal } from './schedule-tv-modal'
import { TVStreamPlayer } from './tv-stream'
import { useTVChat } from './tv-chat'
import { TRADE_TERM } from 'common/envs/constants'
import { UserBetsSummary } from '../bet/user-bet-summary'
import { MarketTitleLabel } from '../contract/market-title-label'
import { ModActionBadge } from '../moderation/mod-action'

export function TVDisplay(props: {
  contract: Contract
  stream?: ScheduleItem
}) {
  const { contract, stream } = props

  const user = useUser()

  const isMod = useAdminOrMod()
  const isStreamCreator = user?.id === stream?.creator_id
  const showModify = isStreamCreator || isMod

  const [showSettings, setShowSettings] = useState(false)

  const isBinary = contract.outcomeType === 'BINARY'
  const perpContract = contract.outcomeType === 'PERP' ? contract : undefined
  const perpPrice =
    perpContract?.resolvedOraclePrice ?? perpContract?.oraclePrice
  const formattedPerpPrice =
    typeof perpPrice === 'number' && Number.isFinite(perpPrice)
      ? formatPerpPrice(perpPrice, inferPerpPriceDecimals([perpPrice]))
      : undefined
  const isMulti =
    contract.outcomeType === 'MULTIPLE_CHOICE' && isMultiCpmm(contract)

  const betPanel = (
    <>
      {tradingAllowed(contract) && isBinary && (
        <>
          <BinaryBetPanel contract={contract} />
          <UserBetsSummary contract={contract} includeSellButton={user} />
        </>
      )}
      {tradingAllowed(contract) && isMulti && (
        <SimpleMultiOverview contract={contract} />
      )}
    </>
  )

  const channelId = `tv-${stream?.id ?? 'default'}`
  const chat = useTVChat({ channelId })

  return (
    <Page trackPageView="tv page" className="!mt-0 xl:col-span-10 xl:pr-0">
      <SEO
        title={`${stream?.title} on Manifold TV`}
        description={`Watch the stream and ${TRADE_TERM} on ${contract.question}`}
        url={`/tv/${stream?.id}`}
        image={contract.coverImageUrl}
      />
      <Row className="w-full items-start">
        <Col className={clsx('bg-canvas-0 w-full rounded-b ')}>
          <TVStreamPlayer stream={stream} />

          <Col className="mb-2 p-4 md:pb-8 lg:px-8">
            <Row className="justify-between gap-4">
              <Row className="items-center gap-2 text-xl font-medium sm:text-2xl">
                <MarketTitleLabel contract={contract} />
                <Link
                  href={`/${contract.creatorUsername}/${contract.slug}`}
                  target="_blank"
                  className="hover:underline"
                >
                  {contract.question}
                </Link>
              </Row>
              {isBinary && (
                <BinaryResolutionOrChance isCol contract={contract} />
              )}
              {perpContract && formattedPerpPrice && (
                <Col className="shrink-0 items-end">
                  <span className="text-ink-500 text-xs">
                    {perpContract.resolvedOraclePrice == null
                      ? 'Oracle price'
                      : 'Settlement price'}
                  </span>
                  <span className="text-xl font-semibold sm:text-2xl">
                    {formattedPerpPrice}
                  </span>
                </Col>
              )}
            </Row>
            {betPanel}
          </Col>

          <Row className="m-4 gap-4">
            {showModify && (
              <Button
                color={isStreamCreator ? 'indigo-outline' : 'purple-outline'}
                onClick={() => setShowSettings(true)}
              >
                {!isStreamCreator && <ModActionBadge className="mr-1" />}
                Modify event
              </Button>
            )}
            <Button
              color="indigo-outline"
              onClick={() => Router.push('/tv/schedule')}
            >
              See schedule
            </Button>
            <ScheduleTVModal
              open={showSettings}
              setOpen={() => setShowSettings(false)}
              stream={stream}
              slug={contract.slug}
            />
          </Row>
        </Col>

        {chat.docked && (
          <Col className="sticky top-0 ml-4 hidden h-screen w-[350px] shrink-0 py-2 xl:flex">
            {chat.docked}
          </Col>
        )}
      </Row>
      {chat.floating}
    </Page>
  )
}
