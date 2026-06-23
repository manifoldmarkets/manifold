import { useState } from 'react'
import { getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract, contractPath } from 'common/contract'
import { formatPercent } from 'common/util/format'
import Image from 'next/image'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { BetDialog } from 'web/components/bet/bet-dialog'
import { BinaryOutcomes } from 'web/components/bet/bet-panel'
import { sliderColors } from 'web/components/widgets/slider'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'

const DEM_LOGO = '/politics-party/democrat_symbol.png'
const REP_LOGO = '/politics-party/republican_symbol.png'
const TRUMP_FACE = '/political-candidates/trump.png'

// Bet dialog labels: YES = Republicans win/hold, NO = Democrats.
const PARTY_PSEUDONYM = {
  YES: {
    pseudonymName: 'Republican',
    pseudonymColor: 'sienna' as keyof typeof sliderColors,
  },
  NO: {
    pseudonymName: 'Democratic',
    pseudonymColor: 'azure' as keyof typeof sliderColors,
  },
}

// The three levers of federal power after the 2026 midterms. The presidency
// isn't on the ballot (Republican through Jan 2029); the Senate and House read
// live odds from the control markets, where YES = Republicans win/hold.
export function BalanceOfPowerPanel(props: {
  houseControl: Contract | null
  senateControl: Contract | null
}) {
  const { houseControl, senateControl } = props

  return (
    <Col className="bg-canvas-0 gap-1 rounded-xl p-4 sm:p-6">
      <div className="text-ink-900 text-xl font-semibold sm:text-2xl">
        Balance of Power
      </div>
      <div className="text-ink-500 text-sm">
        Who controls Washington after the 2026 midterms
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PowerLever
          title="White House"
          name="Donald Trump"
          subtitle="Not on the ballot until 2028"
        />
        <PowerLever title="Senate" contract={senateControl} />
        <PowerLever title="House" contract={houseControl} />
      </div>
    </Col>
  )
}

function PowerLever(props: {
  title: string
  contract?: Contract | null
  subtitle?: string
  // Known officeholder/candidate, shown when there's no market (e.g. Trump).
  name?: string
}) {
  const { title, contract, subtitle, name } = props
  const [betOutcome, setBetOutcome] = useState<BinaryOutcomes>()

  const hasMarket = !!contract
  const rep = contract ? getDisplayProbability(contract as BinaryContract) : 1
  const dem = 1 - rep
  const leaderRep = rep >= 0.5

  return (
    <Col className="bg-canvas-50 gap-2 rounded-lg p-3">
      <Row className="items-center justify-between">
        <span className="text-ink-700 font-medium">{title}</span>
        {hasMarket && (
          <Link
            href={contractPath(contract)}
            className="text-ink-400 hover:text-primary-600 text-xs hover:underline"
          >
            chart →
          </Link>
        )}
      </Row>

      <Row className="items-center gap-2">
        {hasMarket ? (
          <Image
            src={leaderRep ? REP_LOGO : DEM_LOGO}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
        ) : (
          <Image
            src={TRUMP_FACE}
            alt="Donald Trump"
            width={36}
            height={36}
            className="border-ink-200 h-9 w-9 rounded-full border object-cover"
          />
        )}
        {hasMarket && (
          <span
            className="text-3xl font-bold leading-none"
            style={{ color: leaderRep ? REP_COLOR : DEM_COLOR }}
          >
            {formatPercent(leaderRep ? rep : dem)}
          </span>
        )}
        <span className="text-ink-600 text-sm">
          {hasMarket
            ? leaderRep
              ? 'Republican'
              : 'Democratic'
            : name
            ? `(R) ${name}`
            : 'Republican'}
        </span>
      </Row>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        <div style={{ width: `${dem * 100}%`, backgroundColor: DEM_COLOR }} />
        <div style={{ width: `${rep * 100}%`, backgroundColor: REP_COLOR }} />
      </div>

      {hasMarket ? (
        <Row className="mt-1 gap-2">
          <BetChip
            label={`Dem ${formatPercent(dem)}`}
            color={DEM_COLOR}
            onClick={() => setBetOutcome('NO')}
          />
          <BetChip
            label={`Rep ${formatPercent(rep)}`}
            color={REP_COLOR}
            onClick={() => setBetOutcome('YES')}
          />
        </Row>
      ) : (
        <div className="text-ink-500 mt-0.5 text-xs">{subtitle}</div>
      )}

      {hasMarket && betOutcome && (
        <BetDialog
          contract={contract as BinaryContract}
          open={!!betOutcome}
          setOpen={(open) => !open && setBetOutcome(undefined)}
          trackingLocation="balance of power panel"
          initialOutcome={betOutcome}
          binaryPseudonym={PARTY_PSEUDONYM}
          questionPseudonym={title}
        />
      )}
    </Col>
  )
}

function BetChip(props: {
  label: string
  color: string
  onClick: () => void
}) {
  const { label, color, onClick } = props
  return (
    <button
      onClick={onClick}
      className="hover:bg-canvas-100 flex-1 rounded-md border py-1 text-sm font-semibold transition-colors"
      style={{ color, borderColor: color + '66' }}
    >
      {label}
    </button>
  )
}
