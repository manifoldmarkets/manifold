import { contractPath, PerpContract, tradingAllowed } from 'common/contract'
import { inferPriceDecimals } from 'common/perps/format'
import { formatOraclePrice } from 'common/perps/oracle-display'
import { getPerpTicker } from 'common/perps/ticker'
import Link from 'next/link'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { PerpBetPanel } from './perp-bet-panel'
import { PerpExplainerContent } from './perp-market-explainer'
import { PERP_TICKER_CLASS } from './perp-market-badge'
import { PerpOracleAttribution } from './perp-oracle-attribution'
import { PerpPositionPanel } from './perp-position-panel'
import { useLivePerpContract } from './use-live-perp-contract'
import { usePerpPositions } from './use-perp-positions'
import { usePerpTradingStatus } from './use-perp-trading-status'

/**
 * A self-contained trading dialog for any perp surface. Data subscriptions
 * exist only while open; each opening loads positions and recovers orders
 * before quoting an add or flip. Omit initialDirection for a generic Bet
 * entry point, which defaults to the user's held side.
 */
export function PerpBetModal(props: {
  contract: PerpContract
  open: boolean
  setOpen: (open: boolean) => void
  initialDirection?: 'long' | 'short'
  onTrade?: () => void
}) {
  const { contract, open, setOpen } = props
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      size="md"
      ariaLabel={`Trade ${getPerpTicker(contract)}`}
      adaptToKeyboard
      closeButtonPosition="inside"
      className="bg-canvas-0 overflow-hidden rounded-t-xl sm:rounded-xl"
    >
      {open && (
        <PerpBetModalContent
          key={contract.id}
          contract={contract}
          initialDirection={props.initialDirection}
          onTrade={props.onTrade}
        />
      )}
    </Modal>
  )
}

function PerpBetModalContent(props: {
  contract: PerpContract
  initialDirection?: 'long' | 'short'
  onTrade?: () => void
}) {
  const { contract, refresh, refreshKey } = useLivePerpContract(props.contract)
  // Reopening from another card must not reuse pre-trade browser caches.
  const { positions, unsound } = usePerpPositions(contract.id, refreshKey + 1)
  const { oracleFreshness, solvencyHalted, oracleTradingPaused } =
    usePerpTradingStatus(contract)
  const user = useUser()
  const onTrade = () => {
    refresh()
    props.onTrade?.()
  }

  return (
    <Col className="text-ink-1000 max-h-[calc(var(--modal-viewport-height,100dvh)-1rem)] text-left sm:max-h-[85dvh]">
      <Col className="border-ink-200 shrink-0 gap-1 border-b p-4 pr-12">
        <Row className="flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className={PERP_TICKER_CLASS}>{getPerpTicker(contract)}</h2>
          <span className="text-ink-900 text-xl font-semibold tabular-nums">
            {formatOraclePrice(
              contract.oracleFeedId,
              contract.isResolved
                ? contract.resolvedOraclePrice ?? contract.oraclePrice
                : contract.oraclePrice,
              inferPriceDecimals([
                contract.resolvedOraclePrice ?? contract.oraclePrice,
              ])
            )}
          </span>
        </Row>
        <Link
          href={contractPath(contract)}
          className="text-ink-600 hover:text-primary-600 text-sm hover:underline"
        >
          {contract.question}
        </Link>
        <span className="text-ink-400 text-xs">Indicative oracle price</span>
        <PerpOracleAttribution
          feedId={contract.oracleFeedId}
          asOfTime={contract.oracleSourceTime}
          contractId={contract.id}
        />
      </Col>
      <Col className="min-h-0 gap-3 overflow-y-auto overscroll-contain p-4">
        {!tradingAllowed(contract) ? (
          <p className="bg-canvas-50 text-ink-700 rounded-lg p-3 text-sm">
            {contract.isResolved
              ? 'This market has settled. Trading has ended and all positions have been closed.'
              : 'Trading has ended for this market.'}
          </p>
        ) : (
          <>
            {oracleTradingPaused && (
              <div
                role="alert"
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100"
              >
                <p className="font-semibold">
                  {solvencyHalted
                    ? 'Trading paused for a risk check'
                    : 'Trading paused — waiting for oracle'}
                </p>
                <p className="mt-1">
                  {solvencyHalted
                    ? 'Trading resumes after the market processes its next valid risk update.'
                    : oracleFreshness?.reason ??
                      'Trading resumes after the next fresh, valid price update.'}
                </p>
              </div>
            )}
            {user && (
              <details className="text-ink-600 text-sm">
                <summary className="hover:text-primary-600 cursor-pointer font-medium">
                  Manage positions and history
                </summary>
                <Col className="mt-3">
                  <PerpPositionPanel
                    contract={contract}
                    positions={positions}
                    refreshKey={refreshKey}
                    onAction={onTrade}
                    oracleTradingPaused={oracleTradingPaused}
                  />
                </Col>
              </details>
            )}
            <PerpBetPanel
              contract={contract}
              initialDirection={props.initialDirection}
              alwaysExpanded
              positions={positions}
              unsoundPositions={unsound}
              onTrade={onTrade}
              oracleTradingPaused={oracleTradingPaused}
            />
            {user === null && (
              <Button color="gradient" size="lg" onClick={firebaseLogin}>
                Sign in to trade
              </Button>
            )}
          </>
        )}
        <p className="text-ink-500 text-xs leading-relaxed">
          Long benefits when the price rises; short benefits when it falls.
          Leverage multiplies gains and losses, and you can lose all your
          margin. Funding changes your position while you hold it. The fee and
          liquidation price are shown before you confirm.
        </p>
        <details className="text-ink-600 text-sm">
          <summary className="hover:text-primary-600 cursor-pointer font-medium">
            How perpetual betting works
          </summary>
          <Col className="mt-3 gap-4">
            <PerpExplainerContent
              contract={contract}
              hideHeading
              inTradeModal
            />
          </Col>
        </details>
      </Col>
    </Col>
  )
}
