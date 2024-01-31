import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'
import { useState } from 'react'

import { Contract, MultiContract, contractPath } from 'common/contract'
import { SimpleAnswerBars } from 'web/components/answers/answers-panel'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import {
  MODAL_CLASS,
  Modal,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { track } from 'web/lib/service/analytics'
import { DATA, StateDataType } from '../usa-map/usa-map-data'

// This is not live updated from the object, so expects to be passed a contract with updated stuff
export function StateContractCard(props: {
  contract: Contract
  targetState?: string | null
  setTargetState: (state?: string) => void
  children?: React.ReactNode
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  item?: FeedTimelineItem
  className?: string
  /** whether this card is small, like in card grids.*/
  small?: boolean
  hide?: () => void
  showGraph?: boolean
  hideBottomRow?: boolean
  customTitle?: string
  titleSize?: 'lg'
  barColor?: string
}) {
  const {
    promotedData,
    trackingPostfix,
    item,
    className,

    customTitle,
    titleSize,
    contract,
    setTargetState,
  } = props

  const path = contractPath(contract)

  const trackClick = () =>
    track(('click state card ' + trackingPostfix).trim(), {
      contractId: contract.id,
      creatorId: contract.creatorId,
      slug: contract.slug,
      feedId: item?.id,
      isPromoted: !!promotedData,
    })

  const [openStateSelectModal, setOpenStateSelectModal] =
    useState<boolean>(false)

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
      <Col className={'w-full flex-col gap-1.5 '}>
        <Row className={'w-full justify-between'}>
          {/* Title is link to contract for open in new tab and a11y */}
          <Link
            className={clsx(
              'group-hover:text-primary-700 grow items-start font-semibold transition-colors sm:text-lg ',
              titleSize === 'lg' && ' sm:text-3xl'
            )}
            href={path}
            onClick={trackClick}
          >
            <VisibilityIcon contract={contract} />{' '}
            {customTitle ? customTitle : contract.question}
          </Link>
          {
            <button
              className="bg-primary-100 text-primary-700 rounded px-2 text-xs sm:hidden"
              onClick={() => {
                setOpenStateSelectModal(true)
              }}
            >
              Choose state
            </button>
          }
        </Row>
      </Col>
      <Modal
        open={openStateSelectModal}
        setOpen={setOpenStateSelectModal}
        className={MODAL_CLASS}
      >
        {/* Select a state */}
        <Col className={clsx(SCROLLABLE_MODAL_CLASS, 'text-left')}>
          {Object.values(DATA)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((state: StateDataType) => {
              return (
                <button
                  key={state.name}
                  onClick={() => {
                    setTargetState(state.abbreviation)
                    setOpenStateSelectModal(false)
                  }}
                  className="hover:bg-primary-100 flex w-full flex-row items-start  rounded px-4 py-2"
                >
                  {state.name}
                </button>
              )
            })}
        </Col>
      </Modal>

      <div className="w-full overflow-hidden pt-2">
        <SimpleAnswerBars
          contract={contract as MultiContract}
          maxAnswers={4}
          barColor={props.barColor}
        />
      </div>
    </ClickFrame>
  )
}
