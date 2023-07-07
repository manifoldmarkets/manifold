import { CheckIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import React, { useState } from 'react'
import { capitalize, sumBy } from 'lodash'
import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { updateContract } from 'web/lib/firebase/contracts'
import { contractPool } from 'common/contract'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { InfoTooltip } from '../widgets/info-tooltip'
import { useAdmin, useDev } from 'web/hooks/use-admin'
import { ENV_CONFIG, firestoreConsolePath } from 'common/envs/constants'
import ShortToggle from '../widgets/short-toggle'
import { DuplicateContractButton } from '../buttons/duplicate-contract-button'
import { Row } from '../layout/row'
import { BETTORS, User } from 'common/user'
import { Button } from '../buttons/button'
import { AddLiquidityButton } from './add-liquidity-button'
import { Table } from '../widgets/table'
import { ShareEmbedButton } from '../buttons/share-embed-button'
import { QRCode } from '../widgets/qr-code'
import { getShareUrl } from 'common/util/share'
import { formatTime } from 'web/lib/util/time'
import { TweetButton } from '../buttons/tweet-button'
import { ELASTICITY_BET_AMOUNT } from 'common/calculate-metrics'
import { Tabs } from '../layout/tabs'
import { REFERRAL_AMOUNT } from 'common/economy'
import { CopyLinkButton } from '../buttons/copy-link-button'
import { FollowMarketButton } from 'web/components/buttons/follow-market-button'
import { BlockMarketButton } from 'web/components/buttons/block-market-button'
import { ReportButton } from '../buttons/report-button'
import { Input } from '../widgets/input'
import {
  unresolveMarket,
  updateUserDisinterestEmbedding,
} from 'web/lib/firebase/api'
import { BoostButton } from './boost-button'
import { toast } from 'react-hot-toast'
import { TiVolumeMute } from 'react-icons/ti'

export const Stats = (props: {
  contract: Contract
  user?: User | null | undefined
  hideAdvanced?: boolean
}) => {
  const { contract, user, hideAdvanced } = props

  const isDev = useDev()
  const isAdmin = useAdmin()
  const isCreator = user?.id === contract.creatorId
  const isPublic = contract.visibility === 'public'
  const wasUnlistedByCreator = contract.unlistedById
    ? contract.unlistedById === contract.creatorId
    : false

  const [unresolveText, setUnresolveText] = useState('')
  const [unresolving, setUnresolving] = useState(false)

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

  return (
    <Table>
      <tbody>
        {!hideAdvanced && (
          <tr>
            <td>Type</td>
            <td className="flex gap-1">
              {typeDisplay}
              <div className="mx-1 select-none">&middot;</div>
              {mechanism === 'cpmm-1' ? (
                <>
                  Fixed{' '}
                  <InfoTooltip
                    text={`Each YES share is worth ${ENV_CONFIG.moneyMoniker}1 if YES wins.`}
                  />
                </>
              ) : mechanism === 'cpmm-2' || mechanism === 'cpmm-multi-1' ? (
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
        )}

        <tr>
          <td>Question created</td>
          <td>{formatTime(createdTime)}</td>
        </tr>

        {closeTime && (
          <tr>
            <td>Question close{closeTime > Date.now() ? 's' : 'd'}</td>
            <td>{formatTime(closeTime)}</td>
          </tr>
        )}

        {resolutionTime && (
          <tr>
            <td>Question resolved</td>
            <td>{formatTime(resolutionTime)}</td>
          </tr>
        )}

        <tr>
          <td>
            <span className="mr-1">24 hour volume</span>
            <InfoTooltip text="Amount bought or sold in the last 24 hours" />
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

        {!hideAdvanced && !contract.resolution && (
          <tr>
            <td>
              <Row>
                <span className="mr-1">Elasticity</span>
                <InfoTooltip
                  text={
                    mechanism === 'cpmm-1'
                      ? `Log-odds change between a ${formatMoney(
                          ELASTICITY_BET_AMOUNT
                        )} bet on YES and NO`
                      : mechanism === 'cpmm-2'
                      ? `Log-odds change between a ${formatMoney(
                          ELASTICITY_BET_AMOUNT
                        )}bet for and against each outcome`
                      : `Log-odds change from a ${formatMoney(
                          ELASTICITY_BET_AMOUNT
                        )} bet`
                  }
                />
              </Row>
            </td>
            <td>{elasticity.toFixed(2)}</td>
          </tr>
        )}

        <tr>
          <td>Liquidity subsidies</td>
          <td>
            {mechanism === 'cpmm-1' || mechanism === 'cpmm-multi-1'
              ? `${formatMoney(
                  contract.totalLiquidity -
                    contract.subsidyPool -
                    ('answers' in contract
                      ? sumBy(contract.answers, 'subsidyPool')
                      : 0)
                )} / ${formatMoney(contract.totalLiquidity)}`
              : formatMoney(100)}
          </td>
        </tr>

        {!hideAdvanced && (
          <tr>
            <td>Pool</td>
            <td>
              {mechanism === 'cpmm-1' && outcomeType === 'BINARY'
                ? `${Math.round(contract.pool.YES)} YES, ${Math.round(
                    contract.pool.NO
                  )} NO`
                : mechanism === 'cpmm-1' && outcomeType === 'PSEUDO_NUMERIC'
                ? `${Math.round(contract.pool.YES)} HIGHER, ${Math.round(
                    contract.pool.NO
                  )} LOWER`
                : contractPool(contract)}
            </td>
          </tr>
        )}

        {/* Show a path to Firebase if user is an admin, or we're on localhost */}
        {!hideAdvanced && (isAdmin || isDev) && (
          <>
            <tr className="bg-scarlet-500/20">
              <td>Firestore link</td>
              <td>
                <a
                  href={firestoreConsolePath(id)}
                  target="_blank"
                  className="text-primary-400"
                >
                  {id}
                </a>
              </td>
            </tr>
            {contract.isResolved && (
              <tr className="bg-scarlet-500/20">
                <td>Unresolve</td>
                <td>
                  <Row className={'gap-2'}>
                    {/* To prevent accidental unresolve, users must type in 'UNRESOLVE' first */}
                    <Input
                      className="w-40 text-xs"
                      type="text"
                      placeholder="UNRESOLVE"
                      value={unresolveText}
                      onChange={(e) => setUnresolveText(e.target.value)}
                    />
                    <Button
                      onClick={() => {
                        if (unresolving) return
                        setUnresolving(true)
                        unresolveMarket({ marketId: id }).then(() => {
                          setUnresolving(false)
                          setUnresolveText('')
                        })
                      }}
                      disabled={unresolveText !== 'UNRESOLVE' || unresolving}
                      size="2xs"
                      color="red"
                    >
                      <CheckIcon className=" text-ink-100 h-4 w-4" />
                    </Button>
                  </Row>
                </td>
              </tr>
            )}
          </>
        )}

        {!hideAdvanced && contract.visibility != 'private' && (
          <tr className={clsx(isAdmin && 'bg-scarlet-500/20')}>
            <td>
              Publicly listed{' '}
              <InfoTooltip
                text={
                  isPublic
                    ? 'Visible on home page and search results'
                    : 'Only visible via link'
                }
              />
            </td>
            <td>
              <ShortToggle
                disabled={
                  isPublic
                    ? !(isCreator || isAdmin)
                    : !(isAdmin || (isCreator && wasUnlistedByCreator))
                }
                on={isPublic}
                setOn={(pub) =>
                  updateContract(id, {
                    visibility: pub ? 'public' : 'unlisted',
                    unlistedById: pub ? '' : user?.id,
                  })
                }
              />
            </td>
          </tr>
        )}
        {!hideAdvanced && (
          <tr className={clsx(isAdmin && 'bg-scarlet-500/20')}>
            <td>
              Non predictive
              <InfoTooltip
                text={
                  contract.nonPredictive === true
                    ? 'Profits from leagues disabled'
                    : 'Normal prediction market'
                }
              />
            </td>
            <td>
              <ShortToggle
                disabled={true}
                on={contract.nonPredictive === true}
                setOn={() => null}
              />
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  )
}

export function ContractInfoDialog(props: {
  contract: Contract
  user: User | null | undefined
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, user, open, setOpen } = props

  const shareUrl = getShareUrl(contract, user?.username)

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="bg-canvas-0 gap-4 rounded p-6">
        <Row className={'items-center justify-between'}>
          <Title className="!mb-0">This Question</Title>
          <FollowMarketButton contract={contract} user={user} />
        </Row>

        <Tabs
          tabs={[
            {
              title: 'Stats',
              content: (
                <Col>
                  <Stats contract={contract} user={user} />

                  <Row className="mt-4 flex-wrap gap-2">
                    <BoostButton
                      size="sm"
                      contract={contract}
                      color="indigo-outline"
                    />

                    {(contract.mechanism === 'cpmm-1' ||
                      contract.mechanism === 'cpmm-multi-1') && (
                      <AddLiquidityButton contract={contract} />
                    )}

                    <DuplicateContractButton contract={contract} />
                  </Row>
                  <Row className="mt-4 flex-wrap gap-2">
                    <ReportButton
                      report={{
                        contentId: contract.id,
                        contentType: 'contract',
                        contentOwnerId: contract.creatorId,
                      }}
                    />

                    <BlockMarketButton contract={contract} />
                    <DisinterestedButton contract={contract} user={user} />
                  </Row>
                </Col>
              ),
            },
            {
              title: 'Share',
              content: (
                <Col className="max-h-[400px]">
                  <QRCode
                    url={shareUrl}
                    width={250}
                    height={250}
                    className="self-center"
                  />

                  <div className="text-ink-500 mt-4 mb-2 text-base">
                    Invite traders to participate in this question and earn a{' '}
                    {formatMoney(REFERRAL_AMOUNT)} referral bonus for each new
                    trader that signs up.
                  </div>

                  <CopyLinkButton
                    url={getShareUrl(contract, user?.username)}
                    eventTrackingName="copy market link"
                  />
                  <Row className="mt-4 flex-wrap gap-2">
                    <TweetButton
                      tweetText={getShareUrl(contract, user?.username)}
                    />

                    <ShareEmbedButton
                      contract={contract}
                      className="hidden md:flex"
                    />
                  </Row>
                </Col>
              ),
            },
          ]}
        />

        <Row className="items-center justify-start gap-4 rounded-md "></Row>
      </Col>
    </Modal>
  )
}
const DisinterestedButton = (props: {
  contract: Contract
  user: User | null | undefined
}) => {
  const { contract, user } = props
  if (!user) return null
  const markUninteresting = async () => {
    await updateUserDisinterestEmbedding({
      contractId: contract.id,
      creatorId: contract.creatorId,
    })
    toast(`We won't show you content like that again`, {
      icon: <TiVolumeMute className={'h-5 w-5 text-teal-500'} />,
    })
  }
  return (
    <Button size="xs" color="yellow-outline" onClick={markUninteresting}>
      <Row className={'items-center text-sm'}>
        <TiVolumeMute className="h-5 w-5" />
        Uninterested
      </Row>
    </Button>
  )
}
