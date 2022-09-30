import { DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { useState } from 'react'
import { capitalize } from 'lodash'

import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { contractPool, updateContract } from 'web/lib/firebase/contracts'
import { LiquidityBountyPanel } from 'web/components/contract/liquidity-bounty-panel'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Title } from '../title'
import { InfoTooltip } from '../info-tooltip'
import { useAdmin, useDev } from 'web/hooks/use-admin'
import { SiteLink } from '../site-link'
import { firestoreConsolePath } from 'common/envs/constants'
import { deleteField } from 'firebase/firestore'
import ShortToggle from '../widgets/short-toggle'
import { DuplicateContractButton } from '../copy-contract-button'
import { Row } from '../layout/row'
import { BETTORS } from 'common/user'
import { Button } from '../button'

export const contractDetailsButtonClassName =
  'group flex items-center rounded-md px-3 py-2 text-sm font-medium cursor-pointer hover:bg-gray-100 text-gray-400 hover:text-gray-500'

export function ContractInfoDialog(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props

  const [open, setOpen] = useState(false)
  const [featured, setFeatured] = useState(
    (contract?.featuredOnHomeRank ?? 0) > 0
  )
  const isDev = useDev()
  const isAdmin = useAdmin()

  const formatTime = (dt: number) => dayjs(dt).format('MMM DD, YYYY hh:mm a')

  const {
    createdTime,
    closeTime,
    resolutionTime,
    uniqueBettorCount,
    mechanism,
    outcomeType,
    id,
  } = contract

  const typeDisplay =
    outcomeType === 'BINARY'
      ? 'YES / NO'
      : outcomeType === 'FREE_RESPONSE'
      ? 'Free response'
      : outcomeType === 'MULTIPLE_CHOICE'
      ? 'Multiple choice'
      : 'Numeric'

  const onFeaturedToggle = async (enabled: boolean) => {
    if (
      enabled &&
      (contract.featuredOnHomeRank === 0 || !contract?.featuredOnHomeRank)
    ) {
      await updateContract(id, { featuredOnHomeRank: 1 })
      setFeatured(true)
    } else if (!enabled && (contract?.featuredOnHomeRank ?? 0) > 0) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await updateContract(id, { featuredOnHomeRank: deleteField() })
      setFeatured(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        color="gray-white"
        className={clsx(contractDetailsButtonClassName, className)}
        onClick={() => setOpen(true)}
      >
        <DotsHorizontalIcon
          className={clsx('h-5 w-5 flex-shrink-0')}
          aria-hidden="true"
        />
      </Button>

      <Modal open={open} setOpen={setOpen}>
        <Col className="gap-4 rounded bg-white p-6">
          <Title className="!mt-0 !mb-0" text="This Market" />

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

              <tr>
                <td>{capitalize(BETTORS)}</td>
                <td>{uniqueBettorCount ?? '0'}</td>
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
                  <td>[ADMIN] Firestore</td>
                  <td>
                    <SiteLink href={firestoreConsolePath(id)}>
                      Console link
                    </SiteLink>
                  </td>
                </tr>
              )}
              {isAdmin && (
                <tr>
                  <td>[ADMIN] Featured</td>
                  <td>
                    <ShortToggle
                      enabled={featured}
                      setEnabled={setFeatured}
                      onChange={onFeaturedToggle}
                    />
                  </td>
                </tr>
              )}
              {isAdmin && (
                <tr>
                  <td>[ADMIN] Unlisted</td>
                  <td>
                    <ShortToggle
                      enabled={contract.visibility === 'unlisted'}
                      setEnabled={(b) =>
                        updateContract(id, {
                          visibility: b ? 'unlisted' : 'public',
                        })
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <Row className="flex-wrap">
            <DuplicateContractButton contract={contract} />
          </Row>
          {!contract.resolution && <LiquidityBountyPanel contract={contract} />}
        </Col>
      </Modal>
    </>
  )
}
