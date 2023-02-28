import { DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useState } from 'react'
import { capitalize } from 'lodash'
import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { contractPool, updateContract } from 'web/lib/firebase/contracts'
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
import { Button, IconButton } from '../buttons/button'
import { AddLiquidityButton } from './add-liquidity-button'
import { Tooltip } from '../widgets/tooltip'
import { Table } from '../widgets/table'
import { ShareEmbedButton } from '../buttons/share-embed-button'
import { QRCode } from '../widgets/qr-code'
import { getShareUrl } from 'common/util/share'
import { formatTime } from 'web/lib/util/time'
import { TweetButton } from '../buttons/tweet-button'
import { ELASTICITY_BET_AMOUNT } from 'common/calculate-metrics'
import { Tabs } from '../layout/tabs'
import Image from 'next/image'
import { uploadImage } from 'web/lib/firebase/storage'
import { FileUploadButton } from '../buttons/file-upload-button'
import { useMutation } from 'react-query'
import toast from 'react-hot-toast'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { dreamDefault } from '../editor/image-modal'
import { REFERRAL_AMOUNT } from 'common/economy'
import { CopyLinkButton } from '../buttons/copy-link-button'
import { FollowMarketButton } from 'web/components/buttons/follow-market-button'
import { BlockMarketButton } from 'web/components/buttons/block-market-button'
import { ReportButton } from '../buttons/report-button'
import { Input } from '../widgets/input'
import { unresolveMarket } from 'web/lib/firebase/api'

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

  const {
    createdTime,
    closeTime,
    resolutionTime,
    uniqueBettorCount,
    mechanism,
    outcomeType,
    id,
    elasticity,
    pool,
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
        )}

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
            {mechanism === 'cpmm-1'
              ? `${formatMoney(
                  contract.totalLiquidity - contract.subsidyPool
                )} / ${formatMoney(contract.totalLiquidity)}`
              : formatMoney(100)}
          </td>
        </tr>

        {!hideAdvanced && (
          <tr>
            <td>Pool</td>
            <td>
              {mechanism === 'cpmm-1' && outcomeType === 'BINARY'
                ? `${Math.round(pool.YES)} YES, ${Math.round(pool.NO)} NO`
                : mechanism === 'cpmm-1' && outcomeType === 'PSEUDO_NUMERIC'
                ? `${Math.round(pool.YES)} HIGHER, ${Math.round(pool.NO)} LOWER`
                : contractPool(contract)}
            </td>
          </tr>
        )}

        {/* Show a path to Firebase if user is an admin, or we're on localhost */}
        {!hideAdvanced && (isAdmin || isDev) && (
          <>
            <tr className="bg-scarlet-50">
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
              <tr className="bg-scarlet-50">
                <td>Unresolve</td>
                <td>
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
                      unresolveMarket({ marketId: id })
                    }}
                    disabled={unresolveText !== 'UNRESOLVE'}
                    size="2xs"
                    color="red"
                  >
                    ✔️
                  </Button>
                </td>
              </tr>
            )}
          </>
        )}

        {!hideAdvanced && (
          <tr className={clsx(isAdmin && 'bg-scarlet-50')}>
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
      </tbody>
    </Table>
  )
}

export function ContractInfoDialog(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { contract, user } = props
  const isCreator = user?.id === contract.creatorId

  const [open, setOpen] = useState(false)
  const [dreaming, setDreaming] = useState(false)

  const shareUrl = getShareUrl(contract, user?.username)

  async function redream() {
    setDreaming(true)
    const url = await dreamDefault(contract.question)
    await updateContract(contract.id, { coverImageUrl: url })
    setDreaming(false)
  }

  return (
    <>
      <Tooltip text="Market details" placement="bottom" noTap noFade>
        <IconButton size="2xs" onClick={() => setOpen(true)}>
          <DotsHorizontalIcon
            className={clsx('h-5 w-5 flex-shrink-0')}
            aria-hidden="true"
          />
        </IconButton>

        <Modal open={open} setOpen={setOpen}>
          <Col className="bg-canvas-0 gap-4 rounded p-6">
            <Row className={'items-center justify-between'}>
              <Title className="!mb-0">This Market</Title>
              <FollowMarketButton contract={contract} user={user} />
            </Row>

            <Tabs
              tabs={[
                {
                  title: 'Stats',
                  content: <Stats contract={contract} user={user} />,
                },
                {
                  title: 'Cover image',
                  content: (
                    <div className="flex justify-center">
                      <div className="relative shrink">
                        {contract.coverImageUrl ? (
                          <Image
                            src={contract.coverImageUrl}
                            width={400}
                            height={400}
                            alt=""
                          />
                        ) : (
                          <div className="bg-ink-100 flex aspect-square w-[300px] shrink items-center justify-center sm:w-[400px]">
                            No image
                          </div>
                        )}
                        {isCreator && (
                          <div className="absolute bottom-0 right-0">
                            <Row className="gap-1">
                              <ChangeCoverImageButton contract={contract} />
                              <button
                                className="text-ink-0 bg-ink-1000/20 hover:bg-ink-1000/40 flex gap-1 p-2 transition-all [text-shadow:_0_1px_0_rgb(0_0_0)]"
                                onClick={redream}
                              >
                                {dreaming ? (
                                  <Row className="gap-2">
                                    Dreaming <LoadingIndicator size="md" />
                                  </Row>
                                ) : (
                                  'Redream'
                                )}
                              </button>
                            </Row>
                          </div>
                        )}
                      </div>
                    </div>
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
                        Invite traders to participate in this market and earn a{' '}
                        {formatMoney(REFERRAL_AMOUNT)} referral bonus for each
                        new trader that signs up.
                      </div>

                      <CopyLinkButton
                        url={getShareUrl(contract, user?.username)}
                        tracking="copy market share link"
                      />
                    </Col>
                  ),
                },
              ]}
            />

            <Row className="flex-wrap gap-2">
              {contract.mechanism === 'cpmm-1' && (
                <AddLiquidityButton contract={contract} />
              )}

              <DuplicateContractButton contract={contract} />

              <ShareEmbedButton
                contract={contract}
                className="hidden md:flex"
              />

              <TweetButton tweetText={getShareUrl(contract, user?.username)} />
            </Row>
            <Row className={'mt-2 gap-2'}>
              <ReportButton
                report={{
                  contentId: contract.id,
                  contentType: 'contract',
                  contentOwnerId: contract.creatorId,
                }}
              />
              <BlockMarketButton contract={contract} />
            </Row>
            <Row className="items-center justify-start gap-4 rounded-md "></Row>
          </Col>
        </Modal>
      </Tooltip>
    </>
  )
}

const ChangeCoverImageButton = (props: { contract: Contract }) => {
  const uploadMutation = useMutation(fileHandler, {
    onSuccess(url) {
      updateContract(props.contract.id, { coverImageUrl: url })
    },
    onError(error: any) {
      toast.error(error.message ?? error)
    },
  })

  return (
    <FileUploadButton
      onFiles={uploadMutation.mutate}
      className="text-ink-0 bg-ink-1000/20 hover:bg-ink-1000/40 flex gap-1 p-2 transition-all [text-shadow:_0_1px_0_rgb(0_0_0)]"
    >
      Edit
      {uploadMutation.isLoading && <LoadingIndicator size="md" />}
    </FileUploadButton>
  )
}

const fileHandler = async (files: File[]) => {
  if (!files.length) throw new Error('No files selected')
  return await uploadImage('default', files[0])
}
