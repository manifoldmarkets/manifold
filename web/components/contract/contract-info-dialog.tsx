import { DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { uniqBy } from 'lodash'
import { useState } from 'react'
import { Bet } from 'common/bet'

import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { contractPool, updateContract } from 'web/lib/firebase/contracts'
import { LiquidityPanel } from '../liquidity-panel'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Title } from '../title'
import { InfoTooltip } from '../info-tooltip'
import { useAdmin, useDev } from 'web/hooks/use-admin'
import { SiteLink } from '../site-link'
import { firestoreConsolePath } from 'common/envs/constants'
import { deleteField } from 'firebase/firestore'

export const contractDetailsButtonClassName =
  'group flex items-center rounded-md px-3 py-2 text-sm font-medium cursor-pointer hover:bg-gray-100 text-gray-400 hover:text-gray-500'

export function ContractInfoDialog(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props

  const [open, setOpen] = useState(false)
  const [featured, setFeatured] = useState(
    (contract?.featuredOnHomeRank ?? 0) > 0
  )
  const isDev = useDev()
  const isAdmin = useAdmin()

  const formatTime = (dt: number) => dayjs(dt).format('MMM DD, YYYY hh:mm a z')

  const { createdTime, closeTime, resolutionTime, mechanism, outcomeType, id } =
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
                <td className="flex gap-1">
                  {mechanism === 'cpmm-1' ? (
                    <>
                      Fixed{' '}
                      <InfoTooltip text="Each YES share is worth M$1 if YES wins." />
                    </>
                  ) : (
                    <>
                      Parimutuel{' '}
                      <InfoTooltip text="Each share is a fraction of the pool. " />
                    </>
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

              {/* <tr>
                <td>Creator earnings</td>
                <td>{formatMoney(contract.collectedFees.creatorFee)}</td>
              </tr> */}

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

              {/* Show a path to Firebase if user is an admin, or we're on localhost */}
              {(isAdmin || isDev) && (
                <tr>
                  <td>[DEV] Firestore</td>
                  <td>
                    <SiteLink href={firestoreConsolePath(id)}>
                      Console link
                    </SiteLink>
                  </td>
                </tr>
              )}
              {isAdmin && (
                <tr>
                  <td>Set featured</td>
                  <td>
                    <select
                      className="select select-bordered"
                      value={featured ? 'true' : 'false'}
                      onChange={(e) => {
                        const newVal = e.target.value === 'true'
                        if (
                          newVal &&
                          (contract.featuredOnHomeRank === 0 ||
                            !contract?.featuredOnHomeRank)
                        )
                          updateContract(id, {
                            featuredOnHomeRank: 1,
                          })
                            .then(() => {
                              setFeatured(true)
                            })
                            .catch(console.error)
                        else if (
                          !newVal &&
                          (contract?.featuredOnHomeRank ?? 0) > 0
                        )
                          updateContract(id, {
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-ignore
                            featuredOnHomeRank: deleteField(),
                          })
                            .then(() => {
                              setFeatured(false)
                            })
                            .catch(console.error)
                      }}
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </td>
                </tr>
              )}
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
