import { DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useState } from 'react'
import { capitalize } from 'lodash'
import ChallengeIcon from 'web/lib/icons/challenge-icon'

import { Contract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { contractPool, updateContract } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { InfoTooltip } from '../widgets/info-tooltip'
import { useAdmin, useDev } from 'web/hooks/use-admin'
import { SiteLink } from '../widgets/site-link'
import { ENV_CONFIG, firestoreConsolePath } from 'common/envs/constants'
import ShortToggle from '../widgets/short-toggle'
import { DuplicateContractButton } from '../buttons/duplicate-contract-button'
import { Row } from '../layout/row'
import { BETTORS, User } from 'common/user'
import { Button, IconButton } from '../buttons/button'
import { AddLiquidityButton } from './add-liquidity-button'
import { Tooltip } from '../widgets/tooltip'
import { Table } from '../widgets/table'
import { ShareEmbedButton } from '../buttons/share-embed-button'
import { CreateChallengeModal } from '../challenges/create-challenge-modal'
import { CHALLENGES_ENABLED } from 'common/challenge'
import { withTracking } from 'web/lib/service/analytics'
import { QRCode } from '../widgets/qr-code'
import { getShareUrl } from 'common/util/share'
import { BlockMarketButton } from 'web/components/buttons/block-market-button'
import { formatTime } from 'web/lib/util/time'
import { ReportButton } from 'web/components/buttons/report-button'

export function ContractInfoDialog(props: {
  contract: Contract
  user: User | null | undefined
  className?: string
}) {
  const { contract, className, user } = props
  const [open, setOpen] = useState(false)
  const isDev = useDev()
  const isAdmin = useAdmin()
  const isCreator = user?.id === contract.creatorId
  const isUnlisted = contract.visibility === 'unlisted'
  const wasUnlistedByCreator = contract.unlistedById
    ? contract.unlistedById === contract.creatorId
    : false

  const {
    createdTime,
    closeTime,
    resolutionTime,
    uniqueBettorCount,
    mechanism,
    outcomeType,
    id,
    elasticity,
  } = contract

  const typeDisplay =
    outcomeType === 'BINARY'
      ? 'YES / NO'
      : outcomeType === 'FREE_RESPONSE'
      ? 'Free response'
      : outcomeType === 'MULTIPLE_CHOICE'
      ? 'Multiple choice'
      : 'Numeric'

  const [openCreateChallengeModal, setOpenCreateChallengeModal] =
    useState(false)
  const showChallenge =
    user &&
    outcomeType === 'BINARY' &&
    !contract.resolution &&
    CHALLENGES_ENABLED

  const shareUrl = getShareUrl(contract, user?.username)

  return (
    <>
      <Tooltip text="Market details" placement="bottom" noTap noFade>
        <IconButton
          size="2xs"
          className={clsx(className)}
          onClick={() => setOpen(true)}
        >
          <DotsHorizontalIcon
            className={clsx('h-5 w-5 flex-shrink-0')}
            aria-hidden="true"
          />
        </IconButton>

        <Modal open={open} setOpen={setOpen}>
          <Col className="gap-4 rounded bg-white p-6">
            <Row className={'justify-between'}>
              <Title className="!mt-0 !mb-0" text="This Market" />
              {user && (
                <ReportButton
                  report={{
                    contentId: contract.id,
                    contentType: 'contract',
                    contentOwnerId: contract.creatorId,
                  }}
                />
              )}
              <BlockMarketButton contract={contract} />
            </Row>

            <Table>
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
                        <InfoTooltip
                          text={`Each YES share is worth ${ENV_CONFIG.moneyMoniker}1 if YES wins.`}
                        />
                      </>
                    ) : mechanism === 'cpmm-2' ? (
                      <>
                        Fixed{' '}
                        <InfoTooltip
                          text={`Each share in an outcome is worth ${ENV_CONFIG.moneyMoniker}1 if it is chosen.`}
                        />
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
                  <td>
                    <span className="mr-1">24 hour volume</span>
                    <InfoTooltip text="The amount bought or sold in the last 24 hours" />
                  </td>
                  <td>{formatMoney(contract.volume24Hours)}</td>
                </tr>

                <tr>
                  <td>
                    <span className="mr-1">Total volume</span>
                    <InfoTooltip text="Total amount bought or sold" />
                  </td>
                  <td>{formatMoney(contract.volume)}</td>
                </tr>

                <tr>
                  <td>{capitalize(BETTORS)}</td>
                  <td>{uniqueBettorCount ?? '0'}</td>
                </tr>

                <tr>
                  <td>
                    <Row>
                      <span className="mr-1">Elasticity</span>
                      <InfoTooltip
                        text={
                          mechanism === 'cpmm-1'
                            ? 'Probability change between a Ṁ50 bet on YES and NO'
                            : mechanism === 'cpmm-2'
                            ? 'Probability change between a Ṁ50 bet for and against each outcome'
                            : 'Probability change from a Ṁ100 bet'
                        }
                      />
                    </Row>
                  </td>
                  <td>{formatPercent(elasticity)}</td>
                </tr>

                <tr>
                  <td>Liquidity subsidies</td>
                  <td>
                    {mechanism === 'cpmm-1'
                      ? `${formatMoney(
                          contract.totalLiquidity - contract.subsidyPool
                        )} / ${formatMoney(contract.totalLiquidity)}`
                      : formatMoney(100)}
                  </td>
                </tr>

                <tr>
                  <td>Pool</td>
                  <td>
                    {mechanism === 'cpmm-1' && outcomeType === 'BINARY'
                      ? `${Math.round(contract.pool.YES)} YES, ${Math.round(
                          contract.pool.NO
                        )} NO`
                      : mechanism === 'cpmm-1' &&
                        outcomeType === 'PSEUDO_NUMERIC'
                      ? `${Math.round(contract.pool.YES)} HIGHER, ${Math.round(
                          contract.pool.NO
                        )} LOWER`
                      : contractPool(contract)}
                  </td>
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

                <tr>
                  <td>{isAdmin ? '[ADMIN]' : ''} Unlisted</td>
                  <td>
                    <ShortToggle
                      disabled={
                        isUnlisted
                          ? !(isAdmin || (isCreator && wasUnlistedByCreator))
                          : !(isCreator || isAdmin)
                      }
                      on={contract.visibility === 'unlisted'}
                      setOn={(unlist) =>
                        updateContract(id, {
                          visibility: unlist ? 'unlisted' : 'public',
                          unlistedById: unlist ? user?.id : '',
                        })
                      }
                    />
                  </td>
                </tr>
              </tbody>
            </Table>

            <Row className="flex-wrap gap-2">
              {mechanism === 'cpmm-1' && (
                <AddLiquidityButton contract={contract} />
              )}

              <DuplicateContractButton contract={contract} />

              <ShareEmbedButton contract={contract} />

              {showChallenge && (
                <Button
                  size="2xs"
                  color="override"
                  className="gap-1 border-2  border-indigo-500 text-indigo-500 hover:bg-indigo-500 hover:text-white"
                  onClick={withTracking(
                    () => setOpenCreateChallengeModal(true),
                    'click challenge button'
                  )}
                >
                  <ChallengeIcon className="h-4 w-4" /> Challenge
                  <CreateChallengeModal
                    isOpen={openCreateChallengeModal}
                    setOpen={(open) => {
                      if (!open) {
                        setOpenCreateChallengeModal(false)
                        setOpen(false)
                      } else setOpenCreateChallengeModal(open)
                    }}
                    user={user}
                    contract={contract}
                  />
                </Button>
              )}
            </Row>

            <QRCode
              url={shareUrl}
              className="self-center sm:hidden"
              width={150}
              height={150}
            />
          </Col>
        </Modal>
      </Tooltip>
    </>
  )
}
