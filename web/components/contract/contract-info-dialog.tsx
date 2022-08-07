import { DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { uniqBy } from 'lodash'
import { useState } from 'react'
import { Bet } from 'common/bet'

import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { contractPool } from 'web/lib/firebase/contracts'
import { LiquidityPanel } from '../liquidity-panel'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Title } from '../title'
import { InfoTooltip } from '../info-tooltip'
import { useUser } from 'web/hooks/use-user'
import { ENV_CONFIG } from 'common/envs/constants'

export const contractDetailsButtonClassName =
  'group flex items-center rounded-md px-3 py-2 text-sm font-medium cursor-pointer hover:bg-gray-100 text-gray-400 hover:text-gray-500'

export function ContractInfoDialog(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props

  const user = useUser()

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
      : outcomeType === 'MULTIPLE_CHOICE'
      ? 'Multiple choice'
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

          {contract.mechanism === 'cpmm-1' &&
            !contract.resolution &&
            ENV_CONFIG.whitelistCreators?.includes(user?.username ?? '') && (
              <LiquidityPanel contract={contract} />
            )}
        </Col>
      </Modal>
    </>
  )
}
