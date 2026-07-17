import { getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { probToColor } from 'web/components/usa-map/state-election-map'
import { DATA } from 'web/components/usa-map/usa-map-data'
import {
  currentSenate2026,
  senate2026,
} from 'web/public/data/senate-state-data'
import { MapContractsDictionary } from 'web/public/data/elections-data'

// The Republican side of the Senate-control market (YES = Republicans, same
// convention as BalanceOfPowerPanel), as a rounded percent for the OG
// headline. Undefined when the market is missing or not binary — the card
// falls back to a question headline.
export function getSenateControlRepPct(
  contract: Contract | null
): string | undefined {
  if (!contract || contract.mechanism !== 'cpmm-1') return undefined
  return Math.round(
    getDisplayProbability(contract as BinaryContract) * 100
  ).toString()
}

// Encodes the Senate map's per-state shading into a compact string
// ("AL:9d3336,AK:r,...") for the /api/og/election social-preview image, so the
// share thumbnail always shows the same live shading as the page's map.
// Tokens: 6-digit hex = blended market color; d/r/p = the crosshatch fill for
// seats not up in 2026 (both-Dem / both-Rep / split delegation); states with
// neither stay unlisted and render in the default gray.
export function getSenateOgFills(
  senateContracts: MapContractsDictionary
): string {
  const tokens: string[] = []

  for (const stateKey of Object.keys(DATA)) {
    const contract = senateContracts[stateKey]
    if (contract) {
      const color = probToColor(
        contract,
        senate2026.find((s) => s.state === stateKey)
      )
      if (color) {
        tokens.push(`${stateKey}:${color.replace('#', '')}`)
        continue
      }
    }

    // No (interpretable) race market: mirror SenateState's crosshatch for the
    // sitting delegation.
    const held = currentSenate2026.find((s) => s.state === stateKey)
    if (held) {
      const token =
        held.party1 === 'Democrat' && held.party2 === 'Democrat'
          ? 'd'
          : held.party1 === 'Republican' && held.party2 === 'Republican'
          ? 'r'
          : 'p'
      tokens.push(`${stateKey}:${token}`)
    }
  }

  return tokens.join(',')
}
