import { CHINESE_LAB_LIST_VERSION } from 'common/perps/lab-share'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import {
  PROVISIONAL_RECHECK_INTERVAL_MS,
  latestTimestamp,
  parseTimestamp,
} from 'shared/perps/classification-recheck'
import {
  LabClassificationRow,
  getLabClassificationRows,
  provisionalLabEvidence,
  provisionalLabSourceUrl,
  upsertLabClassification,
  validateLabClassificationWrite,
} from 'shared/perps/lab-classifications'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'

// Human adjudication for the Chinese-lab OpenRouter index. This is deliberately
// separate from the weights classifier: the latter decides whether one model's
// weights are downloadable, while this queue decides where an author is
// headquartered (or attributes one anonymous model after its reveal).

const evidenceRecords = (
  evidence: Record<string, unknown>
): Record<string, unknown>[] => {
  const history = evidence['history']
  const historical = !Array.isArray(history)
    ? []
    : history
        .slice()
        .reverse()
        .flatMap((entry): Record<string, unknown>[] => {
          if (!entry || typeof entry !== 'object') return []
          const nested = (entry as Record<string, unknown>)['evidence']
          return nested && typeof nested === 'object' && !Array.isArray(nested)
            ? [nested as Record<string, unknown>]
            : []
        })
  return [evidence, ...historical]
}

const firstEvidenceString = (
  row: LabClassificationRow,
  key: string
): string | null => {
  for (const evidence of evidenceRecords(row.evidence)) {
    const value = evidence[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const allEvidenceStrings = (
  row: LabClassificationRow,
  keys: string[]
): string[] => {
  const values = new Set<string>()
  for (const evidence of evidenceRecords(row.evidence)) {
    for (const key of keys) {
      const value = evidence[key]
      if (typeof value === 'string' && value.trim()) values.add(value.trim())
      if (Array.isArray(value))
        for (const entry of value)
          if (typeof entry === 'string' && entry.trim())
            values.add(entry.trim())
    }
  }
  return [...values]
}

const LAB_AGENT_VERDICTS = ['chinese', 'non-chinese', 'unattributed'] as const
type LabAgentRecommendation = (typeof LAB_AGENT_VERDICTS)[number]

// CURRENT evidence only, never history. A provisional row's history holds the
// research that preceded the operator's default; surfacing that as "the
// latest re-check" would misdate it and could show a stale placement as new.
const currentString = (
  row: LabClassificationRow,
  key: string
): string | null => {
  const value = row.evidence?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// Defensive on shape: jsonb written by a job, surviving across deploys.
// Anything unrecognised reads as "no searches recorded", which is honest.
const agentFindings = (row: LabClassificationRow) => {
  const raw = currentString(row, 'agentRecommendation')
  const agentRecommendation = (
    LAB_AGENT_VERDICTS as readonly string[]
  ).includes(raw ?? '')
    ? (raw as LabAgentRecommendation)
    : null
  const searchesRaw = row.evidence?.['agentSearches']
  const agentSearches = !Array.isArray(searchesRaw)
    ? []
    : searchesRaw.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return []
        const { query, results, error } = entry as Record<string, unknown>
        if (typeof query !== 'string') return []
        return [
          {
            query,
            error: typeof error === 'string' ? error : null,
            results: !Array.isArray(results)
              ? []
              : results.flatMap((result) => {
                  if (!result || typeof result !== 'object') return []
                  const { title, url } = result as Record<string, unknown>
                  if (typeof url !== 'string') return []
                  return [
                    { title: typeof title === 'string' ? title : url, url },
                  ]
                }),
          },
        ]
      })
  const ranAt = parseTimestamp(row.evidence?.['agentRanAt'])
  return {
    agentRecommendation,
    agentPublisher: currentString(row, 'agentPublisher'),
    agentHeadquarters: currentString(row, 'agentHeadquarters'),
    agentSourceUrl: currentString(row, 'agentSourceUrl'),
    agentReasoning: currentString(row, 'agentReasoning'),
    agentSearches,
    recheckedAt: Number.isFinite(ranAt) ? ranAt : null,
  }
}

const rowContext = (row: LabClassificationRow) => ({
  exampleModels:
    row.subject_type === 'model'
      ? [row.subject_slug]
      : allEvidenceStrings(row, ['relatedPermaslugs']),
  exampleNames: allEvidenceStrings(row, ['openRouterName', 'openRouterNames']),
})

const isEditableRow = (row: LabClassificationRow) => {
  // Apply the shared scope rules on read as well as write. That hides malformed
  // legacy rows, seeded subjects, broad `stealth` author rows, and dangerous
  // exact-model rows under ordinary corporate authors.
  return validateLabClassificationWrite(row.subject_type, row.subject_slug).ok
}

const timestamp = (value: string): number => {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const getOpenRouterLabClassifications: APIHandler<
  'get-openrouter-lab-classifications'
> = async (_, auth) => {
  throwErrorIfNotMod(auth.uid)
  const rows = (
    await getLabClassificationRows(createSupabaseDirectClient())
  ).filter(isEditableRow)

  return {
    pending: rows
      .filter((row) => row.is_chinese === null)
      .map((row) => ({
        subjectType: row.subject_type,
        subjectSlug: row.subject_slug,
        discoveredVia: firstEvidenceString(row, 'discoveredVia'),
        ...rowContext(row),
        firstSeen: timestamp(row.first_seen),
        firstRankedAt: row.first_ranked_at
          ? timestamp(row.first_ranked_at)
          : null,
        ...agentFindings(row),
      })),
    decided: rows
      .filter(
        (row): row is LabClassificationRow & { is_chinese: boolean } =>
          row.is_chinese !== null && !row.provisional
      )
      .map((row) => ({
        subjectType: row.subject_type,
        subjectSlug: row.subject_slug,
        isChinese: row.is_chinese,
        evidence:
          firstEvidenceString(row, 'evidence') ??
          firstEvidenceString(row, 'summary') ??
          '',
        sourceUrl: firstEvidenceString(row, 'sourceUrl'),
        ...rowContext(row),
        source: row.source,
        classifiedAt: row.classified_at ? timestamp(row.classified_at) : 0,
        classifiedBy: row.classified_by,
      }))
      .sort((a, b) => b.classifiedAt - a.classifiedAt),
    // The watch list: non-Chinese by default at an operator's say-so,
    // re-checked weekly. Contradicted rows first.
    provisional: rows
      .filter((row) => row.provisional)
      .map((row) => {
        const findings = agentFindings(row)
        return {
          subjectType: row.subject_type,
          subjectSlug: row.subject_slug,
          evidence: firstEvidenceString(row, 'evidence') ?? '',
          sourceUrl: firstEvidenceString(row, 'sourceUrl'),
          ...rowContext(row),
          source: row.source,
          classifiedAt: row.classified_at ? timestamp(row.classified_at) : 0,
          classifiedBy: row.classified_by,
          ...findings,
          nextCheckAt:
            (latestTimestamp([
              row.evidence?.['agentRanAt'],
              row.classified_at,
            ]) ?? Date.now()) + PROVISIONAL_RECHECK_INTERVAL_MS,
          contradicted: findings.agentRecommendation === 'chinese',
        }
      })
      .sort(
        (a, b) =>
          Number(b.contradicted) - Number(a.contradicted) ||
          a.nextCheckAt - b.nextCheckAt
      ),
    seedVersion: CHINESE_LAB_LIST_VERSION,
    recheckIntervalMs: PROVISIONAL_RECHECK_INTERVAL_MS,
  }
}

export const setOpenRouterLabClassification: APIHandler<
  'set-openrouter-lab-classification'
> = async (body, auth) => {
  throwErrorIfNotMod(auth.uid)

  const validation = validateLabClassificationWrite(
    body.subjectType,
    body.subjectSlug
  )
  if (!validation.ok)
    throw new APIError(
      400,
      `${validation.reason} (audited seed version ${CHINESE_LAB_LIST_VERSION})`
    )
  const subjectSlug = validation.subjectSlug

  // The third answer. Non-Chinese as the DEFAULT for a subject nobody can
  // place yet — an anonymous model, a publisher with no documented
  // headquarters — which is the denominator-only treatment the audited seed
  // already gives OpenRouter's own cloaked slugs. The server writes what it
  // is rather than asking the operator to invent an evidence line and a URL,
  // and the row goes on the watcher's weekly re-check for a reveal. Never
  // Chinese: that is a positive claim and needs its evidence.
  const provisional = body.provisional ?? false
  if (provisional && body.isChinese)
    throw new APIError(
      400,
      'A provisional verdict is always non-Chinese — it is the denominator-only ' +
        'default for a subject nobody can place. A Chinese placement needs its evidence.'
    )
  const evidenceSummary = provisional
    ? provisionalLabEvidence(body.subjectType, subjectSlug)
    : body.evidence?.trim() ?? ''
  const sourceUrl = provisional
    ? provisionalLabSourceUrl(body.subjectType, subjectSlug)
    : body.sourceUrl?.trim() ?? ''
  // The schema already refuses a firm verdict without both; restated here so
  // a direct caller gets the rule rather than a constraint error.
  if (!evidenceSummary || !sourceUrl)
    throw new APIError(
      400,
      'A firm verdict needs an evidence summary and a public source URL'
    )

  await upsertLabClassification(createSupabaseDirectClient(), {
    subjectType: body.subjectType,
    subjectSlug,
    isChinese: body.isChinese,
    evidence: {
      evidence: evidenceSummary,
      sourceUrl,
      ...(provisional ? { provisional: true } : {}),
    },
    classifiedBy: auth.uid,
    provisional,
  })

  log(
    `mod ${auth.uid} classified OpenRouter ${body.subjectType} ${subjectSlug} ` +
      `as ${
        body.isChinese
          ? 'Chinese'
          : provisional
          ? 'non-Chinese (provisional, under watch)'
          : 'non-Chinese'
      } (${sourceUrl})`
  )
  return {
    success: true as const,
    subjectType: body.subjectType,
    subjectSlug,
    isChinese: body.isChinese,
    provisional,
  }
}
