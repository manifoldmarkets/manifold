import { formatTimeWithTimezone } from 'client-common/lib/time'
import clsx from 'clsx'
import { ELASTICITY_BET_AMOUNT } from 'common/calculate-metrics'
import { Contract, PerpContract, contractPool } from 'common/contract'
import {
  ENV_CONFIG,
  isAdminId,
  isModId,
  supabaseConsoleContractPath,
  TRADED_TERM,
} from 'common/envs/constants'
import { getPerpBackingPool } from 'common/perps/amm'
import {
  getPerpTakerFeeBps,
  getPerpTakerFeeImpact,
  PERP_TAKER_FEE_IMPACT_MAX,
} from 'common/perps/fees'
import {
  fundingPeriodNoun,
  fundingPeriodUnit,
  getFundingPeriodMs,
  getPerpFundingRate,
} from 'common/perps/funding'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { UNRANKED_GROUP_ID } from 'common/supabase/groups'
import { BETTORS, User } from 'common/user'
import { formatWithCommas } from 'common/util/format'
import { YEAR_MS } from 'common/util/time'
import dayjs from 'dayjs'
import { capitalize, sumBy } from 'lodash'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAdmin, useDev, useTrusted } from 'web/hooks/use-admin'
import { api, updateMarket } from 'web/lib/api/api'
import { MoneyDisplay } from '../bet/money-display'
import { CopyLinkOrShareButton } from '../buttons/copy-link-button'
import { ShareEmbedButton, ShareIRLButton } from '../buttons/share-embed-button'
import { ShareQRButton } from '../buttons/share-qr-button'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { Button } from '../buttons/button'
import SuperBanControl from '../SuperBanControl'
import { useSweepstakes } from '../sweepstakes-provider'
import { InfoBox } from '../widgets/info-box'
import { InfoTooltip } from '../widgets/info-tooltip'
import ShortToggle from '../widgets/short-toggle'
import { linkClass } from '../widgets/site-link'
import { Table } from '../widgets/table'
import { ContractHistoryButton } from './contract-edit-history-button'

export const Stats = (props: {
  contract: Contract
  user?: User | null | undefined
  onRequestCreatorBan?: () => void
}) => {
  const { contract, user, onRequestCreatorBan } = props
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
  const perpContract =
    contract.mechanism === 'perp' ? (contract as PerpContract) : null
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
      : outcomeType === 'PERP'
      ? 'Perpetual'
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
      : mechanism === 'perp'
      ? {
          label: 'Oracle-priced',
          desc: 'Leveraged long and short positions track an external oracle price until they are closed or the market is resolved',
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
    <Table className="table-fixed whitespace-normal sm:whitespace-nowrap">
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
          <td>{formatTimeWithTimezone(createdTime)}</td>
        </tr>

        {perpContract && <PerpStatsRows contract={perpContract} />}

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
                  : formatTimeWithTimezone(closeTime)}
              </td>
            </tr>
          )}

        {resolutionTime && isBettingContract && (
          <tr>
            <td>Question resolved</td>
            <td>{formatTimeWithTimezone(resolutionTime)}</td>
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
              <td>{formatWithCommas(uniqueBettorCount ?? 0)}</td>
            </tr>

            <tr>
              <td>Views</td>
              <td>{formatWithCommas(viewCount ?? 0)}</td>
            </tr>
          </>
        )}
        {!hideAdvanced &&
          !contract.resolution &&
          isBettingContract &&
          !perpContract && (
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

        {isBettingContract && !perpContract && (
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

        {!hideAdvanced && isBettingContract && !perpContract && (
          <tr>
            <td>Pool</td>
            <td>
              {mechanism === 'cpmm-1' && outcomeType === 'BINARY'
                ? `${formatWithCommas(
                    Math.round(contract.pool.YES)
                  )} YES, ${formatWithCommas(Math.round(contract.pool.NO))} NO`
                : mechanism === 'cpmm-1' && outcomeType === 'PSEUDO_NUMERIC'
                ? `${formatWithCommas(
                    Math.round(contract.pool.YES)
                  )} HIGHER, ${formatWithCommas(
                    Math.round(contract.pool.NO)
                  )} LOWER`
                : contractPool(contract)}
            </td>
          </tr>
        )}
        {sweepsEnabled && !isNonBetPollOrBountiedQuestion && (
          <tr>
            <td>Sweepstakes</td>
            <td className={linkClass}>
              <Link
                href={
                  contract.token === 'CASH'
                    ? `/${contract.creatorUsername}/${contract.slug.replace(
                        '--cash',
                        ''
                      )}`
                    : `/${contract.creatorUsername}/${contract.slug}--cash`
                }
              >
                {contract.token === 'CASH' ? 'True' : 'False'}
              </Link>
            </td>
          </tr>
        )}

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

        {!hideAdvanced && isBettingContract && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
            <td>
              🚫 Disable creator betting{' '}
              <InfoTooltip
                text={
                  'Prevent the creator from placing bets on this market. This cannot be undone except by a moderator or admin.'
                }
              />
            </td>
            <td>
              <CheckOrSwitch
                canToggle={
                  isAdmin ||
                  (isMod && !isCreator) ||
                  (isCreator && !contract.creatorBannedFromBetting)
                }
                on={contract.creatorBannedFromBetting === true}
                setOn={(on) => {
                  if (on) {
                    onRequestCreatorBan?.()
                  } else if ((isMod && !isCreator) || isAdmin) {
                    toast.promise(
                      updateMarket({
                        contractId: contract.id,
                        creatorBannedFromBetting: false,
                      }),
                      {
                        loading: 'Reversing creator betting ban...',
                        success: 'Creator can now bet on this market.',
                        error: 'Error reversing ban. Try again?',
                      }
                    )
                  }
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

        {/* Admin debug info - show at the very end */}
        {(isAdmin || isMod || isDev) && (
          <>
            {(isAdmin || isMod) && (
              <AdminHomePageScoreAdjustmentRows
                contract={contract}
                canEdit={isAdmin || isMod}
              />
            )}
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
      </tbody>
    </Table>
  )
}

function PerpStatsRows(props: { contract: PerpContract }) {
  const { contract } = props
  const isAdmin = useAdmin()
  const canEdit = isAdmin && !contract.isResolved
  const price =
    contract.resolution === 'MKT'
      ? Number(contract.resolvedOraclePrice ?? contract.oraclePrice)
      : Number(contract.oraclePrice)
  const fundingRate = getPerpFundingRate(contract)
  const fundingPeriodMs = getFundingPeriodMs(contract)
  const fundingDirection =
    fundingRate > 0
      ? 'longs pay shorts'
      : fundingRate < 0
      ? 'shorts pay longs'
      : 'balanced'
  const fundingDisplay = Number.isFinite(fundingRate)
    ? `${fundingRate > 0 ? '+' : ''}${(fundingRate * 100).toFixed(
        3
      )}% / ${fundingPeriodNoun(fundingPeriodMs)}`
    : '—'

  return (
    <>
      <tr>
        <td>Oracle feed</td>
        <td className="font-mono text-xs">{contract.oracleFeedId}</td>
      </tr>
      <tr>
        <td>
          {contract.resolution === 'MKT' ? 'Settlement price' : 'Oracle price'}
        </td>
        <td>{formatPrice(price, inferPriceDecimals([price]))}</td>
      </tr>
      <tr>
        <td>
          Backing pool{' '}
          <InfoTooltip text="Current mana held across both sides to back position payouts" />
        </td>
        <td>
          <MoneyDisplay
            amount={getPerpBackingPool(contract.poolLong, contract.poolShort)}
            isCashContract={contract.token === 'CASH'}
          />
        </td>
      </tr>
      <tr className={clsx(canEdit && 'bg-purple-500/30')}>
        <td>Maximum leverage</td>
        <td>
          {canEdit ? (
            <MaxLeverageInput contract={contract} />
          ) : Number.isFinite(contract.maxLeverage) ? (
            `${formatWithCommas(contract.maxLeverage)}×`
          ) : (
            '—'
          )}
        </td>
      </tr>
      <tr className={clsx(canEdit && 'bg-purple-500/30')}>
        <td>
          Max funding rate{' '}
          <InfoTooltip text="Per-period cap on the funding haircut at full pool imbalance" />
        </td>
        <td>
          {canEdit ? (
            <MaxFundingRateInput contract={contract} />
          ) : (
            <MaxFundingRateDisplay
              maxFundingRate={contract.maxFundingRate}
              fundingPeriodMs={fundingPeriodMs}
            />
          )}
        </td>
      </tr>
      <tr className={clsx(canEdit && 'bg-purple-500/30')}>
        <td>
          Taker fee{' '}
          <InfoTooltip text="Base fee on notional charged when opening a position (closing is free), paid into this market's backing pool. Prices out oracle-tick sniping. Positions large relative to the pool pay more on top — see fee size impact." />
        </td>
        <td>
          {canEdit ? (
            <TakerFeeBpsInput contract={contract} />
          ) : (
            <span className="tabular-nums">
              {(getPerpTakerFeeBps(contract) / 100).toFixed(2)}%
              {getPerpTakerFeeImpact(contract) > 0 ? ' base' : ''} to open
            </span>
          )}
        </td>
      </tr>
      <tr className={clsx(canEdit && 'bg-purple-500/30')}>
        <td>
          Fee size impact{' '}
          <InfoTooltip text="Size coefficient of the taker fee: the marginal rate at pool-share s is base + impact·s² bps, so a fresh position that is share S of the pool pays base + (impact/3)·S² bps on average. 0 = flat base fee only. Small trades pay ~base regardless of the impact." />
        </td>
        <td>
          {canEdit ? (
            <TakerFeeImpactInput contract={contract} />
          ) : (
            <span className="tabular-nums">
              {formatWithCommas(getPerpTakerFeeImpact(contract))}
            </span>
          )}
        </td>
      </tr>
      <tr>
        <td>
          Current funding{' '}
          <InfoTooltip text="The crowded side pays this fraction of margin to the other side each funding period" />
        </td>
        <td>
          {fundingDisplay}{' '}
          <span className="text-ink-500 text-xs">({fundingDirection})</span>
        </td>
      </tr>
      {canEdit && (
        <tr className="bg-purple-500/30">
          <td>
            Pool subsidy{' '}
            <InfoTooltip text="Add mana from your balance into one side's backing pool. Use to restore a side's margin cover (pool below its side's total cost basis)." />
          </td>
          <td>
            <AddPerpSubsidyInput contract={contract} />
          </td>
        </tr>
      )}
      {canEdit && (
        <tr className="bg-purple-500/30">
          <td>
            Resolve{' '}
            <InfoTooltip text="Settles every open position at the latest published oracle price and closes the market permanently. Perps are meant to run indefinitely — this is an escape hatch, not routine." />
          </td>
          <td>
            <ResolvePerpButton contract={contract} />
          </td>
        </tr>
      )}
    </>
  )
}

// Admin-only escape hatch. `resolvePerp` settles every open position at the
// newest published feed point — not necessarily the cached oraclePrice, which
// lags whenever the engine has been rejecting updates — pays the residual pool
// to the creator, and marks the contract resolved. There is no undo, so the
// button confirms in place rather than firing on the first click.
function ResolvePerpButton(props: { contract: PerpContract }) {
  const { contract } = props
  const [confirming, setConfirming] = useState(false)
  const [resolving, setResolving] = useState(false)
  const price = Number(contract.oraclePrice)
  // Shown only as orientation: the settlement price is whatever the feed has
  // published by the time the transaction runs, which is newer than this
  // whenever the market has been stuck.
  const cachedLabel = !Number.isFinite(price)
    ? ''
    : ` (cached: ${formatPrice(price, inferPriceDecimals([price]))}${
        contract.oraclePriceTime
          ? `, ${formatTimeWithTimezone(contract.oraclePriceTime)}`
          : ''
      })`

  const resolve = async () => {
    if (resolving) return
    setResolving(true)
    try {
      // `outcome` is ignored on the PERP path — the engine always writes 'MKT'
      // with the settlement price — but the shared schema still requires one.
      await api('market/:contractId/resolve', {
        contractId: contract.id,
        outcome: 'MKT',
      })
      setConfirming(false)
      toast.success('Market resolved')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to resolve market'
      )
    } finally {
      setResolving(false)
    }
  }

  if (!confirming)
    return (
      <Button
        size="2xs"
        color="red-outline"
        onClick={() => setConfirming(true)}
      >
        Resolve market
      </Button>
    )

  return (
    <Col className="gap-1">
      <span className="text-ink-600 text-xs">
        Settles every open position at the latest published oracle price
        {cachedLabel} and closes the market. This cannot be undone.
      </span>
      <Row className="items-center gap-1.5">
        <Button size="2xs" color="red" disabled={resolving} onClick={resolve}>
          {resolving ? 'Resolving…' : 'Confirm resolve'}
        </Button>
        <Button
          size="2xs"
          color="gray-outline"
          disabled={resolving}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </Row>
    </Col>
  )
}

function MaxFundingRateDisplay(props: {
  maxFundingRate: number
  fundingPeriodMs: number
}) {
  const { maxFundingRate, fundingPeriodMs } = props
  if (!Number.isFinite(maxFundingRate) || !(fundingPeriodMs > 0)) return <>—</>
  const annualPct = maxFundingRate * (YEAR_MS / fundingPeriodMs) * 100
  return (
    <span className="tabular-nums">
      {(maxFundingRate * 100).toFixed(4)}% /{' '}
      {fundingPeriodNoun(fundingPeriodMs)}{' '}
      <span className="text-ink-500 text-xs">
        (~{annualPct.toFixed(0)}%/yr)
      </span>
    </span>
  )
}

// Inline admin editor for update-perp-config. The change applies to the next
// trade immediately (the engine re-reads the contract per trade); lowering
// the cap only constrains new opens — existing positions are grandfathered.
function MaxLeverageInput(props: { contract: PerpContract }) {
  const { contract } = props
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  // Bridge the gap between a save and the next contract poll so the row
  // never flashes the pre-save cap.
  const [justSaved, setJustSaved] = useState<number | null>(null)
  const current =
    justSaved != null && justSaved !== contract.maxLeverage
      ? justSaved
      : contract.maxLeverage
  const parsed = Number(input)
  const valid =
    input !== '' && Number.isFinite(parsed) && parsed > 1 && parsed <= 100

  const submit = async () => {
    if (!valid || saving || parsed === current) return
    setSaving(true)
    try {
      const res = await api('update-perp-config', {
        contractId: contract.id,
        maxLeverage: parsed,
      })
      setJustSaved(res.maxLeverage)
      setInput('')
      toast.success(`Max leverage is now ${res.maxLeverage}×`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update max leverage'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Row className="items-center gap-2">
      <span className="tabular-nums">
        {Number.isFinite(current) ? `${formatWithCommas(current)}×` : '—'}
      </span>
      <input
        type="number"
        min={1}
        max={100}
        step={0.5}
        value={input}
        disabled={saving}
        placeholder="New cap"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        className="bg-canvas-0 border-ink-300 h-7 w-24 rounded-md border px-2 text-sm"
      />
      <Button
        size="2xs"
        color="indigo-outline"
        disabled={!valid || saving || parsed === current}
        loading={saving}
        onClick={submit}
      >
        Set
      </Button>
    </Row>
  )
}

// Inline admin editor for a perp's open-side taker fee. Input is in BASIS
// POINTS of notional (10 = 0.10% to open; closing is free); 0 disables the
// fee. Applies to the next open or add immediately.
function TakerFeeBpsInput(props: { contract: PerpContract }) {
  const { contract } = props
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState<number | null>(null)
  const stored = getPerpTakerFeeBps(contract)
  const current = justSaved != null && justSaved !== stored ? justSaved : stored
  const parsed = Number(input)
  const valid =
    input !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100

  const submit = async () => {
    if (!valid || saving || parsed === current) return
    setSaving(true)
    try {
      const res = await api('update-perp-config', {
        contractId: contract.id,
        takerFeeBps: parsed,
      })
      setJustSaved(res.takerFeeBps)
      setInput('')
      toast.success(
        `Taker fee is now ${res.takerFeeBps} bps (${(
          res.takerFeeBps / 100
        ).toFixed(2)}%) to open`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update taker fee'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Row className="flex-wrap items-center gap-1.5">
      <span className="tabular-nums">
        {current} bps ({(current / 100).toFixed(2)}%)
      </span>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={input}
        disabled={saving}
        placeholder="New bps"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        className="bg-canvas-0 border-ink-300 h-7 w-20 rounded-md border px-2 text-sm"
      />
      <Button
        size="2xs"
        color="indigo-outline"
        disabled={!valid || saving || parsed === current}
        loading={saving}
        onClick={submit}
      >
        Set
      </Button>
    </Row>
  )
}

// Inline admin editor for a perp's fee size-impact coefficient. The marginal
// taker fee at pool-share s is base + impact·s² bps; 0 keeps the fee flat at
// the base. Applies to the next open or add immediately.
function TakerFeeImpactInput(props: { contract: PerpContract }) {
  const { contract } = props
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  // justSaved bridges the gap until the contract prop reflects the save. It
  // remembers the stored value AT save time (the baseline) and speaks only
  // while the prop still shows that stale baseline; the effect RETIRES it
  // permanently on the first prop movement, because display logic alone
  // would resurrect the bridge if a later admin change happened to restore
  // the baseline value (save 20 over 0, prop shows 20, someone restores 0 —
  // without retirement the stale 20 would reappear).
  const [justSaved, setJustSaved] = useState<{
    saved: number
    baseline: number
  } | null>(null)
  const stored = getPerpTakerFeeImpact(contract)
  useEffect(() => {
    if (justSaved != null && stored !== justSaved.baseline) setJustSaved(null)
  }, [justSaved, stored])
  const current =
    justSaved != null && stored === justSaved.baseline
      ? justSaved.saved
      : stored
  const parsed = Number(input)
  const valid =
    input !== '' &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= PERP_TAKER_FEE_IMPACT_MAX

  const submit = async () => {
    if (!valid || saving || parsed === current) return
    setSaving(true)
    try {
      const res = await api('update-perp-config', {
        contractId: contract.id,
        takerFeeImpact: parsed,
      })
      setJustSaved({ saved: res.takerFeeImpact, baseline: stored })
      setInput('')
      // The response's base, not the possibly-stale prop's — the base may
      // have just been edited in the sibling input.
      const poolSizedPct = (res.takerFeeBps + res.takerFeeImpact / 3) / 100
      toast.success(
        res.takerFeeImpact > 0
          ? `Fee size impact is now ${
              res.takerFeeImpact
            } — a pool-sized position pays ${poolSizedPct.toFixed(
              2
            )}% effective`
          : 'Fee size impact is off — the taker fee is flat at the base'
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update fee size impact'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Row className="flex-wrap items-center gap-1.5">
      <span className="tabular-nums">{formatWithCommas(current)}</span>
      <input
        type="number"
        min={0}
        max={PERP_TAKER_FEE_IMPACT_MAX}
        step={10}
        value={input}
        disabled={saving}
        placeholder="New impact"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        className="bg-canvas-0 border-ink-300 h-7 w-24 rounded-md border px-2 text-sm"
      />
      <Button
        size="2xs"
        color="indigo-outline"
        disabled={!valid || saving || parsed === current}
        loading={saving}
        onClick={submit}
      >
        Set
      </Button>
    </Row>
  )
}

// Inline admin editor for a perp's per-period funding cap. Input is in
// PERCENT PER PERIOD (e.g. 2 = 2% of the crowded side per period at full
// imbalance) — the engine stores the fraction. Applies from the next
// funding event; must stay under 100% or funding fail-closes entirely.
function MaxFundingRateInput(props: { contract: PerpContract }) {
  const { contract } = props
  const fundingPeriodMs = getFundingPeriodMs(contract)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState<number | null>(null)
  const current =
    justSaved != null && justSaved !== contract.maxFundingRate
      ? justSaved
      : contract.maxFundingRate
  const parsed = Number(input) / 100
  const valid =
    input !== '' && Number.isFinite(parsed) && parsed > 0 && parsed < 1

  const submit = async () => {
    if (!valid || saving || parsed === current) return
    setSaving(true)
    try {
      const res = await api('update-perp-config', {
        contractId: contract.id,
        maxFundingRate: parsed,
      })
      setJustSaved(res.maxFundingRate)
      setInput('')
      toast.success(
        `Max funding rate is now ${(res.maxFundingRate * 100).toFixed(
          4
        )}% / ${fundingPeriodNoun(fundingPeriodMs)}`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update max funding rate'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Row className="flex-wrap items-center gap-1.5">
      <span className="tabular-nums">
        {Number.isFinite(current)
          ? `${(current * 100).toFixed(4)}%/${fundingPeriodUnit(
              fundingPeriodMs
            )}`
          : '—'}
      </span>
      <input
        type="number"
        min={0}
        max={99}
        step={0.1}
        value={input}
        disabled={saving}
        placeholder="New %"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        className="bg-canvas-0 border-ink-300 h-7 w-20 rounded-md border px-2 text-sm"
      />
      <Button
        size="2xs"
        color="indigo-outline"
        disabled={!valid || saving || parsed === current}
        loading={saving}
        onClick={submit}
      >
        Set
      </Button>
    </Row>
  )
}

// Inline admin tool to top up one side's backing pool from the admin's own
// balance. Shows the live per-side split so a margin-cover hole (pool below
// the side's total cost basis) can be sized and filled in one place.
function AddPerpSubsidyInput(props: { contract: PerpContract }) {
  const { contract } = props
  const [side, setSide] = useState<'long' | 'short'>('short')
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState<{
    poolLong: number
    poolShort: number
  } | null>(null)
  const pools =
    justSaved != null &&
    (justSaved.poolLong !== contract.poolLong ||
      justSaved.poolShort !== contract.poolShort)
      ? justSaved
      : { poolLong: contract.poolLong, poolShort: contract.poolShort }
  const parsed = Number(input)
  const valid = input !== '' && Number.isFinite(parsed) && parsed > 0

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const res = await api('add-perp-subsidy', {
        contractId: contract.id,
        side,
        amount: parsed,
      })
      setJustSaved({ poolLong: res.poolLong, poolShort: res.poolShort })
      setInput('')
      toast.success(
        `Added M$${formatWithCommas(
          parsed
        )} to the ${side} pool. L=${res.poolLong.toFixed(
          2
        )} S=${res.poolShort.toFixed(2)}`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to add pool subsidy'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Col className="gap-1">
      <span className="text-ink-500 text-xs tabular-nums">
        L: {pools.poolLong.toFixed(2)} · S: {pools.poolShort.toFixed(2)}
      </span>
      <Row className="flex-wrap items-center gap-1.5">
        <Row className="border-ink-300 shrink-0 overflow-hidden rounded-md border">
          {(['long', 'short'] as const).map((s) => (
            <button
              key={s}
              className={clsx(
                'px-1.5 py-0.5 text-xs',
                side === s ? 'bg-primary-500 text-white' : 'text-ink-700'
              )}
              disabled={saving}
              onClick={() => setSide(s)}
            >
              {s}
            </button>
          ))}
        </Row>
        <input
          type="number"
          min={0}
          value={input}
          disabled={saving}
          placeholder="M$"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="bg-canvas-0 border-ink-300 h-7 w-20 rounded-md border px-2 text-sm"
        />
        <Button
          size="2xs"
          color="indigo-outline"
          disabled={!valid || saving}
          loading={saving}
          onClick={submit}
        >
          Add
        </Button>
      </Row>
    </Col>
  )
}

function AdminHomePageScoreAdjustmentRows(props: {
  contract: Contract
  canEdit: boolean
}) {
  const { contract, canEdit } = props
  const [adjustment, setAdjustment] = useState(
    contract.homePageScoreAdjustment?.toString() ?? ''
  )
  const [days, setDays] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setAdjustment(contract.homePageScoreAdjustment?.toString() ?? '')
    setDays('')
  }, [
    contract.homePageScoreAdjustment,
    contract.homePageScoreAdjustmentExpiresAt,
    contract.id,
  ])

  const saveAdjustment = async () => {
    const parsedAdjustment = Number(adjustment)
    const parsedDays = Number(days)

    if (
      adjustment.trim() === '' ||
      Number.isNaN(parsedAdjustment) ||
      parsedAdjustment < -1 ||
      parsedAdjustment > 1
    ) {
      toast.error('Adjustment must be a number between -1 and 1.')
      return
    }

    if (
      days.trim() === '' ||
      !Number.isInteger(parsedDays) ||
      parsedDays <= 0
    ) {
      toast.error('Duration must be a positive whole number of days.')
      return
    }

    setIsSaving(true)
    await toast
      .promise(
        updateMarket({
          contractId: contract.id,
          homePageScoreAdjustment: parsedAdjustment,
          homePageScoreAdjustmentDays: parsedDays,
        }),
        {
          loading: 'Saving home page score adjustment...',
          success: 'Saved home page score adjustment.',
          error: 'Failed to save home page score adjustment.',
        }
      )
      .finally(() => setIsSaving(false))
  }

  const clearAdjustment = async () => {
    setIsSaving(true)
    await toast
      .promise(
        updateMarket({
          contractId: contract.id,
          homePageScoreAdjustment: null,
        }),
        {
          loading: 'Clearing home page score adjustment...',
          success: 'Cleared home page score adjustment.',
          error: 'Failed to clear home page score adjustment.',
        }
      )
      .then(() => {
        setAdjustment('')
        setDays('')
      })
      .finally(() => setIsSaving(false))
  }

  const expiresAt = contract.homePageScoreAdjustmentExpiresAt
  const hasValidExpiry = expiresAt !== undefined && Number.isFinite(expiresAt)
  const hasActiveAdjustment =
    contract.homePageScoreAdjustment !== undefined &&
    (!hasValidExpiry || expiresAt > Date.now())

  return (
    <>
      <tr className="bg-purple-500/30">
        <td>Importance score</td>
        <td>{contract.importanceScore.toFixed(3)}</td>
      </tr>
      <tr className="bg-purple-500/30">
        <td>Freshness score</td>
        <td>{contract.freshnessScore.toFixed(3)}</td>
      </tr>
      <tr className="bg-purple-500/30">
        <td colSpan={2} className="whitespace-normal">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div>
              Home page score adjustment{' '}
              <InfoTooltip text="Adds a value from -1 to 1 to both importance and freshness scores until it expires." />
            </div>
            <div className="sm:text-right">
              {hasActiveAdjustment ? (
                <span>
                  {contract.homePageScoreAdjustment?.toFixed(3)}
                  {hasValidExpiry
                    ? ` until ${formatTimeWithTimezone(expiresAt)}`
                    : ''}
                </span>
              ) : contract.homePageScoreAdjustment !== undefined ? (
                <span>
                  {contract.homePageScoreAdjustment.toFixed(3)}
                  {hasValidExpiry
                    ? ` (expired ${formatTimeWithTimezone(expiresAt)})`
                    : ' (expired)'}
                </span>
              ) : (
                'None'
              )}
            </div>
          </div>
        </td>
      </tr>
      <tr className="bg-purple-500/30 align-top">
        <td colSpan={2} className="whitespace-normal">
          <div className="flex max-w-full flex-col gap-3">
            <div className="text-sm font-medium">Adjust home page score</div>
            <div className="grid grid-cols-1 gap-2 sm:max-w-sm sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-600">Adjustment</span>
                <input
                  type="number"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={adjustment}
                  disabled={isSaving || !canEdit}
                  onChange={(e) => setAdjustment(e.target.value)}
                  className="bg-canvas-0 border-ink-300 w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-600">Days</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={days}
                  disabled={isSaving || !canEdit}
                  onChange={(e) => setDays(e.target.value)}
                  className="bg-canvas-0 border-ink-300 w-full rounded-md border px-3 py-2"
                />
              </label>
            </div>
            <div className="flex max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={isSaving || !canEdit}
                onClick={saveAdjustment}
                className="bg-primary-600 hover:bg-primary-700 disabled:bg-ink-300 w-full rounded-md px-3 py-2 text-sm font-medium text-white sm:w-auto"
              >
                Save
              </button>
              <button
                type="button"
                disabled={
                  isSaving ||
                  !canEdit ||
                  contract.homePageScoreAdjustment === undefined
                }
                onClick={clearAdjustment}
                className="border-ink-300 text-ink-700 hover:bg-canvas-50 disabled:text-ink-400 w-full rounded-md border px-3 py-2 text-sm font-medium sm:w-auto"
              >
                Clear
              </button>
            </div>
            <div className="text-ink-600 max-w-sm text-sm">
              Negative values derank the market on home. Positive values boost
              it.
            </div>
          </div>
        </td>
      </tr>
    </>
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
  contract: Contract
  user: User | null | undefined
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, user, open, setOpen } = props
  const isAdmin = useAdmin()
  const isTrusted = useTrusted()
  const [showCreatorBanConfirm, setShowCreatorBanConfirm] = useState(false)

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 flex flex-col gap-4 rounded p-6"
    >
      <Stats
        contract={contract}
        user={user}
        onRequestCreatorBan={() => setShowCreatorBanConfirm(true)}
      />

      {!!user && (
        <Row className="flex-wrap gap-2">
          <ContractHistoryButton contract={contract} />
          <ShareQRButton contract={contract} />
          <ShareIRLButton contract={contract} />
          <ShareEmbedButton contract={contract} />
        </Row>
      )}

      {(isAdmin || isTrusted) && (
        <SuperBanControl userId={contract.creatorId} />
      )}

      <Modal
        open={showCreatorBanConfirm}
        setOpen={setShowCreatorBanConfirm}
        className="bg-canvas-0 rounded-lg"
      >
        <Col className="gap-4 p-6">
          <h3 className="text-ink-1000 text-lg font-semibold">
            Block yourself from betting?
          </h3>
          <p className="text-ink-700 text-sm">
            You are about to block yourself from betting on this market. This
            action <strong>cannot be undone</strong> except by a moderator or
            admin. Your existing limit orders will be cancelled and you will not
            be able to buy or sell any shares.
          </p>
          <Row className="justify-end gap-2">
            <Button
              color="gray"
              onClick={() => setShowCreatorBanConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                setShowCreatorBanConfirm(false)
                toast.promise(
                  updateMarket({
                    contractId: contract.id,
                    creatorBannedFromBetting: true,
                  }),
                  {
                    loading: 'Blocking creator from betting...',
                    success: 'You are now blocked from betting on this market.',
                    error: 'Error setting ban. Try again?',
                  }
                )
              }}
            >
              Confirm
            </Button>
          </Row>
        </Col>
      </Modal>
    </Modal>
  )
}
