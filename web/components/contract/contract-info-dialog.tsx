import { DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { uniqBy } from 'lodash'
import { useState } from 'react'
import { Bet } from 'common/bet'

import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { contractPath, contractPool } from 'web/lib/firebase/contracts'
import { LiquidityPanel } from '../liquidity-panel'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { ShareEmbedButton } from '../share-embed-button'
import { Title } from '../title'
import { TweetButton } from '../tweet-button'
import { InfoTooltip } from '../info-tooltip'
import { DuplicateContractButton } from '../copy-contract-button'

export const contractDetailsButtonClassName =
  'group flex items-center rounded-md px-3 py-2 text-sm font-medium cursor-pointer hover:bg-gray-100 text-gray-400 hover:text-gray-500'

export function ContractInfoDialog(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props

  const [open, setOpen] = useState(false)

  const formatTime = (dt: number) => dayjs(dt).format('MMM DD, YYYY hh:mm a z')

  const { createdTime, closeTime, resolutionTime, mechanism, outcomeType } =
    contract

  const tradersCount = uniqBy(
    bets.filter((bet) => !bet.isAnte),
    'userId'
  ).length

  const typeDisplay =
    outcomeType === 'BINARY'
      ? 'YES / NO'
      : outcomeType === 'FREE_RESPONSE'
      ? 'Free response'
      : 'Numeric'

  return (
    <>
      <button
        className={contractDetailsButtonClassName}
        onClick={() => setOpen(true)}
      >
        <DotsHorizontalIcon
          className={clsx('h-6 w-6 flex-shrink-0')}
          aria-hidden="true"
        />
      </button>

      <Modal open={open} setOpen={setOpen}>
        <Col className="gap-4 rounded bg-white p-6">
          <Title className="!mt-0 !mb-0" text="Market info" />

          <div>Share</div>

          <Row className="justify-start gap-4">
            <TweetButton
              className="self-start"
              tweetText={getTweetText(contract)}
            />
            <ShareEmbedButton contract={contract} toastClassName={'-left-20'} />
            <DuplicateContractButton contract={contract} />
          </Row>
          <div />

          <div>Stats</div>

          <table className="table-compact table-zebra table w-full text-gray-500">
            <tbody>
              <tr>
                <td>Type</td>
                <td>{typeDisplay}</td>
              </tr>

              <tr>
                <td>Payout</td>
                <td>
                  {mechanism === 'cpmm-1' ? (
                    <>
                      Fixed{' '}
                      <InfoTooltip text="Each YES share is worth M$1 if YES wins." />
                    </>
                  ) : (
                    <div>
                      Parimutuel{' '}
                      <InfoTooltip text="Each share is a fraction of the pool. " />
                    </div>
                  )}
                </td>
              </tr>

              <tr>
                <td>Market created</td>
                <td>{formatTime(createdTime)}</td>
              </tr>

              {closeTime && (
                <tr>
                  <td>Market close{closeTime > Date.now() ? 's' : 'd'}</td>
                  <td>{formatTime(closeTime)}</td>
                </tr>
              )}

              {resolutionTime && (
                <tr>
                  <td>Market resolved</td>
                  <td>{formatTime(resolutionTime)}</td>
                </tr>
              )}

              <tr>
                <td>Volume</td>
                <td>{formatMoney(contract.volume)}</td>
              </tr>

              <tr>
                <td>Creator earnings</td>
                <td>{formatMoney(contract.collectedFees.creatorFee)}</td>
              </tr>

              <tr>
                <td>Traders</td>
                <td>{tradersCount}</td>
              </tr>

              <tr>
                <td>
                  {mechanism === 'cpmm-1' ? 'Liquidity pool' : 'Betting pool'}
                </td>
                <td>{contractPool(contract)}</td>
              </tr>
            </tbody>
          </table>

          {contract.mechanism === 'cpmm-1' && !contract.resolution && (
            <LiquidityPanel contract={contract} />
          )}
        </Col>
      </Modal>
    </>
  )
}

const getTweetText = (contract: Contract) => {
  const { question, resolution } = contract

  const tweetDescription = resolution ? `\n\nResolved ${resolution}!` : ''

  const timeParam = `${Date.now()}`.substring(7)
  const url = `https://manifold.markets${contractPath(contract)}?t=${timeParam}`

  return `${question}\n\n${url}${tweetDescription}`
}
