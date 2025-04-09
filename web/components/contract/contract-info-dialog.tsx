import clsx from 'clsx'
import { ELASTICITY_BET_AMOUNT } from 'common/calculate-metrics'
import { Contract, contractPool } from 'common/contract'
import {
  ENV_CONFIG,
  isAdminId,
  isModId,
  supabaseConsoleContractPath,
  TRADED_TERM,
} from 'common/envs/constants'
import { UNRANKED_GROUP_ID } from 'common/supabase/groups'
import { BETTORS, User } from 'common/user'
import dayjs from 'dayjs'
import { capitalize, sumBy } from 'lodash'
import { toast } from 'react-hot-toast'
import { useAdmin, useDev, useTrusted } from 'web/hooks/use-admin'
import { api, updateMarket } from 'web/lib/api/api'
import { formatTime } from 'client-common/lib/time'
import { MoneyDisplay } from '../bet/money-display'
import { CopyLinkOrShareButton } from '../buttons/copy-link-button'
import { ShareEmbedButton, ShareIRLButton } from '../buttons/share-embed-button'
import { ShareQRButton } from '../buttons/share-qr-button'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import SuperBanControl from '../SuperBanControl'
import { InfoBox } from '../widgets/info-box'
import { InfoTooltip } from '../widgets/info-tooltip'
import ShortToggle from '../widgets/short-toggle'
import { Table } from '../widgets/table'
import { ContractHistoryButton } from './contract-edit-history-button'
import { SweepsToggle } from '../sweeps/sweeps-toggle'
import { useSweepstakes } from '../sweepstakes-provider'
export const Stats = (props: {
  contract: Contract
  setIsPlay: (isPlay: boolean) => void
  user?: User | null | undefined
}) => {
  const { contract, user, setIsPlay } = props
  const { creatorId } = contract
  const shouldAnswersSumToOne =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.shouldAnswersSumToOne
      : false
  const addAnswersMode =
    contract.mechanism === 'cpmm-multi-1' ? contract.addAnswersMode : 'DISABLED'
  const isCashContract = contract.token === 'CASH'

  const hideAdvanced = !user
  const isDev = useDev()
  const isAdmin = !!user && isAdminId(user?.id)
  const isTrusty = !!user && isModId(user?.id)
  const isMod = isAdmin || isTrusty
  const isCreator = user?.id === creatorId
  const isPublic = contract.visibility === 'public'
  const isMulti = contract.mechanism === 'cpmm-multi-1'
  const addAnswersPossible =
    isMulti && (shouldAnswersSumToOne ? addAnswersMode !== 'DISABLED' : true)
  const creatorOnly = isMulti && addAnswersMode === 'ONLY_CREATOR'
  const wasUnlistedByCreator = contract.unlistedById
    ? contract.unlistedById === creatorId
    : false

  const {
    createdTime,
    closeTime,
    resolutionTime,
    uniqueBettorCount,
    mechanism,
    viewCount,
    outcomeType,
    id,
    elasticity,
  } = contract

  const typeDisplay =
    outcomeType === 'BINARY'
      ? 'YES / NO'
      : outcomeType === 'MULTIPLE_CHOICE'
      ? 'Multiple choice'
      : outcomeType === 'BOUNTIED_QUESTION'
      ? 'Bounty'
      : outcomeType === 'POLL'
      ? 'Poll'
      : outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'NUMBER'
      ? 'Numeric'
      : outcomeType.toLowerCase()

  const mechanismDisplay =
    mechanism === 'cpmm-1'
      ? {
          label: 'Fixed',
          desc: `Each YES share is worth ${ENV_CONFIG.moneyMoniker}1 if YES wins`,
        }
      : mechanism === 'cpmm-multi-1'
      ? contract.shouldAnswersSumToOne
        ? {
            label: 'Dependent',
            desc: `Each share in an outcome is worth ${ENV_CONFIG.moneyMoniker}1 if it is chosen. Only one outcome can be chosen`,
          }
        : {
            label: 'Independent',
            desc: `Each answer is a separate binary contract with shares worth ${ENV_CONFIG.moneyMoniker}1 if chosen. Any number of answers can be chosen`,
          }
      : mechanism == 'none'
      ? undefined
      : { label: 'Mistake', desc: "Likely one of Austin's bad ideas" }

  const isBettingContract = contract.mechanism !== 'none'
  const drizzler = mechanism === 'cpmm-1' || mechanism === 'cpmm-multi-1'
  const drizzled = drizzler
    ? contract.totalLiquidity -
      contract.subsidyPool -
      ('answers' in contract ? sumBy(contract.answers, 'subsidyPool') : 0)
    : 0

  const { prefersPlay, setPrefersPlay } = useSweepstakes()
  const isPlay = contract.token == 'MANA'
  const sweepsEnabled = !!contract.siblingContractId

  const isNonBetPollOrBountiedQuestion =
    contract.mechanism === 'none' &&
    (contract.outcomeType === 'POLL' ||
      contract.outcomeType === 'BOUNTIED_QUESTION')

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
              <td>
                <MoneyDisplay
                  amount={contract.totalBounty}
                  isCashContract={isCashContract}
                />
              </td>
            </tr>
            <tr>
              <td>
                Bounty left <InfoTooltip text="Bounty left to pay out" />
              </td>
              <td>
                <MoneyDisplay
                  amount={contract.bountyLeft}
                  isCashContract={isCashContract}
                />
              </td>
            </tr>
          </>
        )}

        {closeTime &&
          (isBettingContract ||
            contract.outcomeType == 'BOUNTIED_QUESTION') && (
            <tr>
              <td>Question close{closeTime > Date.now() ? 's' : 'd'}</td>

              <td>
                {!closeTime ||
                dayjs(closeTime).isAfter(
                  dayjs(contract.createdTime).add(dayjs.duration(900, 'year'))
                )
                  ? 'Never'
                  : formatTime(closeTime)}
              </td>
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
              <td>
                <MoneyDisplay
                  amount={contract.volume24Hours}
                  isCashContract={isCashContract}
                />
              </td>
            </tr>

            <tr>
              <td>
                <span className="mr-1">Total volume</span>
                <InfoTooltip text="Total amount bought or sold" />
              </td>
              <td>
                <MoneyDisplay
                  amount={contract.volume}
                  isCashContract={isCashContract}
                />
              </td>
            </tr>

            {/* <tr>
              <td>
                <span className="mr-1">Collected fees</span>
                <InfoTooltip text="Includes both platform and creator fees" />
              </td>
              <td>
                <MoneyDisplay
                  amount={sum(Object.values(contract.collectedFees))}
                  isCashContract={isCashContract}
                  numberType="toDecimal"
                />
              </td>
            </tr> */}

            <tr>
              <td>{capitalize(BETTORS)}</td>
              <td>{uniqueBettorCount ?? '0'}</td>
            </tr>

            <tr>
              <td>Views</td>
              <td>{viewCount ?? '0'}</td>
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
                    mechanism === 'cpmm-1' ? (
                      <>
                        Log-odds change between a{' '}
                        <MoneyDisplay
                          amount={ELASTICITY_BET_AMOUNT}
                          isCashContract={isCashContract}
                        />{' '}
                        {TRADED_TERM} on YES and NO
                      </>
                    ) : (
                      <>
                        Log-odds change from a{' '}
                        <MoneyDisplay
                          amount={ELASTICITY_BET_AMOUNT}
                          isCashContract={isCashContract}
                        />{' '}
                        {TRADED_TERM}
                      </>
                    )
                  }
                />
              </Row>
            </td>
            <td>{elasticity.toFixed(2)}</td>
          </tr>
        )}

        {isBettingContract && (
          <>
            <tr>
              <td>Liquidity subsidies</td>
              <td>
                {drizzler ? (
                  <>
                    <MoneyDisplay
                      amount={drizzled}
                      isCashContract={isCashContract}
                    />{' '}
                    /{' '}
                    <MoneyDisplay
                      amount={contract.totalLiquidity}
                      isCashContract={isCashContract}
                    />
                  </>
                ) : (
                  <MoneyDisplay amount={100} isCashContract={isCashContract} />
                )}
              </td>
            </tr>
          </>
        )}
        {drizzler && drizzled !== contract.totalLiquidity ? (
          <tr>
            <td colSpan={2}>
              <InfoBox
                title="Where's my liquidity?"
                text="Liquidity is
                  drizzled in slowly to prevent manipulation"
              />
            </td>
          </tr>
        ) : null}

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
        <tr>
          <td>Sweeps</td>
          <td>
            {!isNonBetPollOrBountiedQuestion && (
              <SweepsToggle
                sweepsEnabled={sweepsEnabled}
                isPlay={isPlay}
                onClick={() => {
                  if (prefersPlay && isPlay) {
                    setPrefersPlay(false)
                    setIsPlay(false)
                  } else if (!prefersPlay && !isPlay) {
                    setPrefersPlay(true)
                    setIsPlay(true)
                  } else if (prefersPlay && !isPlay) {
                    setIsPlay(true)
                  } else if (!prefersPlay && isPlay) {
                    setIsPlay(false)
                  }
                }}
              />
            )}
          </td>
        </tr>

        {addAnswersPossible && (isCreator || isAdmin || isMod) && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
            <td>
              Creator only{' '}
              <InfoTooltip
                text={
                  creatorOnly
                    ? 'Only creator can add answers'
                    : 'Anyone can add answers'
                }
              />
            </td>
            <td>
              <ShortToggle
                className="mr-1 align-middle"
                on={creatorOnly}
                setOn={(on) =>
                  updateMarket({
                    contractId: contract.id,
                    addAnswersMode: on ? 'ONLY_CREATOR' : 'ANYONE',
                  })
                }
              />
              {addAnswersMode === 'DISABLED' && <span>(Disabled for all)</span>}
            </td>
          </tr>
        )}

        {/* Show a path to Firebase if user is an admin, or we're on localhost */}
        {(isAdmin || isDev) && (
          <>
            <tr className="bg-purple-500/30">
              <td>Supabase link</td>
              <td>
                <a
                  href={supabaseConsoleContractPath(id)}
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
                <span className="truncate">select * from contracts...</span>
                <CopyLinkOrShareButton
                  url={`select * from contracts where id = '${id}';`}
                  tooltip="Copy sql query to contract id"
                  eventTrackingName={'admin copy contract id'}
                  className="!py-0 align-middle"
                  trackingInfo={{ contractId: id }}
                />
              </td>
            </tr>
          </>
        )}

        {!hideAdvanced && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
            <td>
              🔎 Publicly listed{' '}
              <InfoTooltip
                text={
                  isPublic
                    ? 'Visible on home page and search results'
                    : 'Only visible via link'
                }
              />
            </td>
            <td>
              <CheckOrSwitch
                canToggle={isMod || isCreator}
                disabled={!isPublic && !isMod && !wasUnlistedByCreator}
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
              🏆 Ranked{' '}
              <InfoTooltip
                text={'Profit from this market count towards leagues'}
              />
            </td>
            <td>
              <CheckOrSwitch
                canToggle={isMod}
                disabled={!isPublic}
                on={isPublic && contract.isRanked !== false}
                setOn={(on) => {
                  toast.promise(
                    api('market/:contractId/group', {
                      contractId: contract.id,
                      groupId: UNRANKED_GROUP_ID,
                      remove: on,
                    }),
                    {
                      loading: `${
                        on ? 'Removing' : 'Adding'
                      } question to the unranked topic...`,
                      success: `Successfully ${
                        on ? 'removed' : 'added'
                      } question to the unranked topic!`,
                      error: `Error ${
                        on ? 'removing' : 'adding'
                      } topic. Try again?`,
                    }
                  )
                }}
              />
            </td>
          </tr>
        )}

        {!hideAdvanced && contract.outcomeType === 'DATE' && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
            <td>
              🕒 Clock mode{' '}
              <InfoTooltip
                text={'Display date as a clock instead of the default view'}
              />
            </td>
            <td>
              <CheckOrSwitch
                canToggle={isMod || isCreator}
                on={contract.display === 'clock'}
                setOn={(on) =>
                  updateMarket({
                    contractId: contract.id,
                    display: on ? 'clock' : 'default',
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

export const CheckOrSwitch = (props: {
  canToggle: boolean
  disabled?: boolean
  on: boolean
  setOn: (on: boolean) => void
}) => {
  const { on, setOn, canToggle, disabled } = props
  return canToggle ? (
    <ShortToggle
      className="align-middle"
      disabled={disabled}
      on={on}
      setOn={setOn}
    />
  ) : on ? (
    <>✅</>
  ) : (
    <>❌</>
  )
}

export function ContractInfoDialog(props: {
  playContract: Contract
  statsContract: Contract
  user: User | null | undefined
  setIsPlay: (isPlay: boolean) => void
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { playContract, statsContract, user, open, setOpen, setIsPlay } = props
  const isAdmin = useAdmin()
  const isTrusted = useTrusted()

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 flex flex-col gap-4 rounded p-6"
    >
      <Stats contract={statsContract} user={user} setIsPlay={setIsPlay} />

      {!!user && (
        <>
          <Row className="my-2 flex-wrap gap-2">
            <ContractHistoryButton contract={playContract} />
            <ShareQRButton contract={playContract} />
            <ShareIRLButton contract={playContract} />
            <ShareEmbedButton contract={statsContract} />
          </Row>
          <Row className="flex-wrap gap-2">
            {isAdmin || isTrusted ? (
              <SuperBanControl userId={playContract.creatorId} />
            ) : null}
          </Row>
        </>
      )}
    </Modal>
  )
}
