import { unzipSync, strFromU8 } from 'fflate'

import { csvToRecords } from 'common/util/csv'
import { log } from './utils'

// Epoch Capabilities Index (ECI) frontier — the oracle for the AI-capability
// perp. Epoch publishes computed per-model ECI scores (CC-BY; market
// descriptions must credit "Epoch AI Capabilities Index") inside their
// benchmark data zip. There is no standalone CSV URL, hence the zip dance.
//
// The oracle value for a day D is the FRONTIER: the max ECI score across all
// models released on or before D. It moves in steps when a new frontier model
// gets evaluated, and the daily job re-asserts today's value even when
// unchanged so feed freshness reflects job health, not model releases.

export const ECI_DATA_URL = 'https://epoch.ai/data/benchmark_data.zip'
const ECI_CSV_NAME = 'epoch_capabilities_index.csv'
const FETCH_TIMEOUT_MS = 60_000

export type EciModel = {
  modelVersion: string
  score: number
  releaseDate: string // YYYY-MM-DD
}

export const parseEciCsv = (csvText: string): EciModel[] => {
  return csvToRecords(csvText)
    .map((r) => ({
      modelVersion: r['Model version'],
      score: Number(r['ECI Score']),
      releaseDate: r['Release date'],
    }))
    .filter(
      (m) =>
        !!m.modelVersion &&
        isFinite(m.score) &&
        /^\d{4}-\d{2}-\d{2}$/.test(m.releaseDate)
    )
}

export const fetchEciModels = async (): Promise<EciModel[]> => {
  const res = await fetch(ECI_DATA_URL, {
    headers: { 'user-agent': 'Manifold/1.0 (+https://manifold.markets)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok)
    throw new Error(`Epoch data download: ${res.status} ${res.statusText}`)
  const zipped = new Uint8Array(await res.arrayBuffer())
  const files = unzipSync(zipped)
  const entry = Object.entries(files).find(([name]) =>
    name.endsWith(ECI_CSV_NAME)
  )
  if (!entry)
    throw new Error(`${ECI_CSV_NAME} not found in Epoch data zip`)
  const models = parseEciCsv(strFromU8(entry[1]))
  log(`[eci] parsed ${models.length} models from Epoch data`)
  return models
}

/** Max ECI score among models released on or before `isoDate` (YYYY-MM-DD),
 * or null if none. String compare works because dates are ISO. */
export const eciFrontierOnDate = (
  models: EciModel[],
  isoDate: string
): number | null => {
  let best: number | null = null
  for (const m of models) {
    if (m.releaseDate <= isoDate && (best === null || m.score > best))
      best = m.score
  }
  return best
}
