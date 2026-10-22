import { CHINESE_LAB_LIST_VERSION } from 'common/perps/lab-share'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import {
  LabClassificationRow,
  getLabClassificationRows,
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
      })),
    decided: rows
      .filter(
        (row): row is LabClassificationRow & { is_chinese: boolean } =>
          row.is_chinese !== null
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
    seedVersion: CHINESE_LAB_LIST_VERSION,
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

  await upsertLabClassification(createSupabaseDirectClient(), {
    subjectType: body.subjectType,
    subjectSlug,
    isChinese: body.isChinese,
    evidence: {
      evidence: body.evidence.trim(),
      sourceUrl: body.sourceUrl.trim(),
    },
    classifiedBy: auth.uid,
  })

  log(
    `mod ${auth.uid} classified OpenRouter ${body.subjectType} ${subjectSlug} ` +
      `as ${body.isChinese ? 'Chinese' : 'non-Chinese'} (${body.sourceUrl})`
  )
  return {
    success: true as const,
    subjectType: body.subjectType,
    subjectSlug,
    isChinese: body.isChinese,
  }
}
