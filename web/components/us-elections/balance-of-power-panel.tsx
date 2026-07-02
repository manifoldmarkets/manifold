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

// The two chambers in play in the 2026 midterms. The presidency isn't on the
// ballot (Republican through Jan 2029) — that's clear from the 2028 section
// above — so only the Senate and House are shown here, reading live odds from
// the control markets where YES = Republicans win/hold.
export function BalanceOfPowerPanel(props: {
  houseControl: Contract | null
  senateControl: Contract | null
}) {
  const { houseControl, senateControl } = props

  // Bare levers grid — the surrounding "2026 Midterms" card supplies the title,
  // subtitle, and background.
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <PowerLever title="Senate" contract={senateControl} />
      <PowerLever title="House" contract={houseControl} />
    </div>
  )
}

function PowerLever(props: { title: string; contract: Contract | null }) {
  const { title, contract } = props
  const [betOutcome, setBetOutcome] = useState<BinaryOutcomes>()

  if (!contract) {
    return (
      <Col className="bg-canvas-50 gap-2 rounded-lg p-3">
        <span className="text-ink-700 font-medium">{title}</span>
        <span className="text-ink-500 text-sm">No market yet</span>
      </Col>
    )
  }

  const rep = getDisplayProbability(contract as BinaryContract)
  const dem = 1 - rep
  const leaderRep = rep >= 0.5

  return (
    <Col className="bg-canvas-50 gap-2 rounded-lg p-3">
      <Row className="items-center justify-between">
        <span className="text-ink-700 font-medium">{title}</span>
        <Link
          href={contractPath(contract)}
          className="text-ink-400 hover:text-primary-600 text-xs hover:underline"
        >
          chart →
        </Link>
      </Row>

      <Row className="items-center gap-2">
        <Image
          src={leaderRep ? REP_LOGO : DEM_LOGO}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
        />
        <span
          className="text-3xl font-bold leading-none"
          style={{ color: leaderRep ? REP_COLOR : DEM_COLOR }}
        >
          {formatPercent(leaderRep ? rep : dem)}
        </span>
        <span className="text-ink-600 text-sm">
          {leaderRep ? 'Republican' : 'Democratic'}
        </span>
      </Row>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        <div style={{ width: `${dem * 100}%`, backgroundColor: DEM_COLOR }} />
        <div style={{ width: `${rep * 100}%`, backgroundColor: REP_COLOR }} />
      </div>

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

      {betOutcome && (
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

function BetChip(props: { label: string; color: string; onClick: () => void }) {
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
