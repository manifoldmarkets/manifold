import clsx from 'clsx'
import { ELASTICITY_BET_AMOUNT } from 'common/calculate-metrics'
import {
  Contract,
  contractPool,
} from 'common/contract'
import {
  ENV_CONFIG,
  firestoreConsolePath,
  isAdminId,
  isTrustworthy,
} from 'common/envs/constants'
import { BETTORS, User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { capitalize, sumBy } from 'lodash'
import { toast } from 'react-hot-toast'
import { TiVolumeMute } from 'react-icons/ti'
import { BlockMarketButton } from 'web/components/buttons/block-market-button'
import { FollowMarketButton } from 'web/components/buttons/follow-market-button'
import {
  useDev,
} from 'web/hooks/use-admin'
import {
  addContractToGroup,
  removeContractFromGroup,
  updateMarket,
  updateUserDisinterestEmbedding,
} from 'web/lib/firebase/api'
import { formatTime } from 'web/lib/util/time'
import { Button } from '../buttons/button'
import { CopyLinkOrShareButton } from '../buttons/copy-link-button'
import { DuplicateContractButton } from '../buttons/duplicate-contract-button'
import { ReportButton } from '../buttons/report-button'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import ShortToggle from '../widgets/short-toggle'
import { Table } from '../widgets/table'
import { NON_PREDICTIVE_GROUP_ID } from 'common/supabase/groups'
import { ContractHistoryButton } from './contract-edit-history-button'
import { ShareEmbedButton } from '../buttons/share-embed-button'
import { ShareQRButton } from '../buttons/share-qr-button'

export const Stats = (props: {
  contract: Contract
  user?: User | null | undefined
  hideAdvanced?: boolean
}) => {
  const { contract, user, hideAdvanced } = props

  const isDev = useDev()
  const isAdmin = !!user && isAdminId(user?.id)
  const isTrusty = !!user && isTrustworthy(user?.username)
  const isMod = isAdmin || isTrusty
  const isCreator = user?.id === contract.creatorId
  const isPublic = contract.visibility === 'public'
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
      : outcomeType === 'BOUNTIED_QUESTION'
      ? 'Bounty'
      : outcomeType === 'POLL'
      ? 'Poll'
      : outcomeType === 'NUMERIC' || outcomeType === 'PSEUDO_NUMERIC'
      ? 'Numeric'
      : outcomeType.toLowerCase()

  const mechanismDisplay =
    mechanism === 'cpmm-1'
      ? {
          label: 'Fixed',
          desc: `Each YES share is worth ${ENV_CONFIG.moneyMoniker}1 if YES wins`,
        }
      : mechanism === 'cpmm-2' || mechanism === 'cpmm-multi-1'
      ? {
          label: 'Fixed',
          desc: `Each share in an outcome is worth ${ENV_CONFIG.moneyMoniker}1 if it is chosen`,
        }
      : mechanism == 'dpm-2'
      ? { label: 'Parimutuel', desc: 'Each share is a fraction of the pool' }
      : { label: 'Mistake', desc: "Likely one of Austin's bad ideas" }

  const isBettingContract = contract.mechanism !== 'none'
  return (
    <Table>
      <tbody>
        <tr>
          <td>Type</td>
          <td className="flex gap-1">
            {typeDisplay}
            {mechanismDisplay && (
              <>
                <div className="mx-1 select-none">&middot;</div>
                {mechanismDisplay.label}{' '}
                <InfoTooltip text={mechanismDisplay.desc} />
              </>
            )}
          </td>
        </tr>

        <tr>
          <td>Question created</td>
          <td>{formatTime(createdTime)}</td>
        </tr>

        {contract.outcomeType == 'BOUNTIED_QUESTION' && (
          <>
            <tr>
              <td>
                Total bounty{' '}
                <InfoTooltip text="The total bounty the creator has put up" />
              </td>
              <td>{formatMoney(contract.totalBounty)}</td>
            </tr>
            <tr>
              <td>
                Bounty paid{' '}
                <InfoTooltip text="The bounty that has been paid out so far" />
              </td>
              <td>{formatMoney(contract.totalBounty - contract.bountyLeft)}</td>
            </tr>
          </>
        )}

        {closeTime && isBettingContract && (
          <tr>
            <td>Question close{closeTime > Date.now() ? 's' : 'd'}</td>
            <td>{formatTime(closeTime)}</td>
          </tr>
        )}

        {resolutionTime && isBettingContract && (
          <tr>
            <td>Question resolved</td>
            <td>{formatTime(resolutionTime)}</td>
          </tr>
        )}

        {isBettingContract && (
          <>
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
          </>
        )}
        {!hideAdvanced && !contract.resolution && isBettingContract && (
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

        {isBettingContract && (
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
        )}

        {!hideAdvanced && isBettingContract && (
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
            <tr className="bg-purple-500/30">
              <td>Firestore link</td>
              <td>
                <a
                  href={firestoreConsolePath(id)}
                  target="_blank"
                  className="text-primary-600"
                  rel="noreferrer"
                >
                  {id}
                </a>
              </td>
            </tr>
            <tr className="bg-purple-500/30">
              <td>SQL query</td>
              <td>
                <span className="trucnate">select * from contracts...</span>
                <CopyLinkOrShareButton
                  url={`select * from contracts where id = '${id}';`}
                  tooltip="Copy sql query to contract id"
                  eventTrackingName={'admin copy contract id'}
                  className="!py-0 align-middle"
                />
              </td>
            </tr>
          </>
        )}

        {!hideAdvanced && contract.visibility != 'private' && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
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
                className="align-middle"
                disabled={
                  isPublic
                    ? !(isCreator || isMod)
                    : !(isMod || (isCreator && wasUnlistedByCreator))
                }
                on={isPublic}
                setOn={(pub) =>
                  updateMarket({
                    contractId: contract.id,
                    visibility: pub ? 'public' : 'unlisted',
                  })
                }
              />
            </td>
          </tr>
        )}
        {!hideAdvanced && isBettingContract && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
            <td>
              In leagues{' '}
              <InfoTooltip
                text={
                  'Whether profit count torward leagues - typically off for non-predictive questions'
                }
              />
            </td>
            <td>
              <ShortToggle
                className="align-middle"
                disabled={!isMod}
                on={!contract.nonPredictive}
                setOn={(on) => {
                  toast.promise(
                    on
                      ? removeContractFromGroup({
                          contractId: contract.id,
                          groupId: NON_PREDICTIVE_GROUP_ID,
                        })
                      : addContractToGroup({
                          contractId: contract.id,
                          groupId: NON_PREDICTIVE_GROUP_ID,
                        }).catch((e) => {
                          console.error(e.message)
                          throw e
                        }),
                    {
                      loading: `${
                        on ? 'Removing' : 'Adding'
                      } question to non-predictive group...`,
                      success: `Successfully ${
                        on ? 'removed' : 'added'
                      } question to non-predictive group!`,
                      error: `Error ${
                        on ? 'removing' : 'adding'
                      } category. Try again?`,
                    }
                  )
                }}
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

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 flex flex-col gap-4 rounded p-6"
    >
      <FollowMarketButton contract={contract} user={user} />

      <Stats contract={contract} user={user} hideAdvanced={!user} />

      {!!user && (
        <>
          <Row className="flex-wrap gap-2">
            <DuplicateContractButton contract={contract} />

            <ContractHistoryButton contract={contract} />
            <ShareQRButton contract={contract} />
            <ShareEmbedButton contract={contract} />
          </Row>
          <Row className="flex-wrap gap-2">
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
        </>
      )}
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
