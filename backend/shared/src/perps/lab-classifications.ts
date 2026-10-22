import {
  AuthorEvidence,
  DEFAULT_LAB_SHARE_CLASSIFICATIONS,
  LabShareClassifications,
  authorOfPermaslug,
} from 'common/perps/lab-share'
import {
  basePermaslug,
  isCompositeSlug,
  isValidPermaslug,
} from 'common/perps/open-weight-models'
import { SupabaseDirectClient } from 'shared/supabase/init'

// Database-backed maintenance layer for the Chinese-lab OpenRouter index.
//
// The constants in common/perps/lab-share remain the audited seed and always
// win at their own specificity. Database rows add classifications for newly
// observed authors, plus exact-model exceptions such as an anonymous preview
// once its publisher is known. Exact-model rules are evaluated before author
// rules by computeLabShare, so a DB model verdict can intentionally be more
// specific than a seeded author verdict without silently rewriting the seed.

export const LAB_CLASSIFICATION_SUBJECT_TYPES = ['author', 'model'] as const
export type LabClassificationSubjectType =
  (typeof LAB_CLASSIFICATION_SUBJECT_TYPES)[number]

export type LabClassificationSource = 'auto' | 'admin'

export type LabClassificationRow = {
  subject_type: LabClassificationSubjectType
  subject_slug: string
  is_chinese: boolean | null
  source: LabClassificationSource
  evidence: Record<string, unknown>
  first_seen: string
  first_ranked_at: string | null
  classified_at: string | null
  classified_by: string | null
  updated_time: string
}

export type LabClassificationSubject = {
  subjectType: LabClassificationSubjectType
  subjectSlug: string
}

export type PendingLabClassification = LabClassificationSubject & {
  evidence?: Record<string, unknown>
  /** Set when this subject affects a live ranking or historical backfill. */
  firstRankedAt?: number | null
}

type MutableLabShareClassifications = {
  chinese: Record<string, AuthorEvidence>
  nonChinese: Record<string, AuthorEvidence>
  chineseModels: Record<string, AuthorEvidence>
  nonChineseModels: Record<string, AuthorEvidence>
}

const own = (record: Readonly<Record<string, unknown>>, key: string) =>
  Object.prototype.hasOwnProperty.call(record, key)

// Assignment to `record.__proto__` invokes Object.prototype's legacy setter
// instead of creating an own key. Upstream author/model segments are untrusted,
// and the common scorer intentionally supports prototype-named authors, so DB
// overlays must use an explicit own data property too.
const setOwn = <T>(record: Record<string, T>, key: string, value: T) =>
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })

export const isLabClassificationSubjectType = (
  value: string
): value is LabClassificationSubjectType =>
  (LAB_CLASSIFICATION_SUBJECT_TYPES as readonly string[]).includes(value)

/**
 * Normalize and validate the key stored in the composite primary key.
 *
 * Model variants (`:free`, etc.) collapse to their base permaslug because
 * they are the same model. Composite router/floating aliases are excluded by
 * the index and therefore cannot carry a useful verdict. Author keys are the
 * literal first segment emitted by OpenRouter: no slash, colon or whitespace.
 */
export const normalizeLabClassificationSubject = (
  subjectType: LabClassificationSubjectType,
  subjectSlug: string
): string => {
  const trimmed = subjectSlug.trim()
  if (subjectType === 'author') {
    if (!/^[^/:\s]+$/.test(trimmed))
      throw new Error(
        `refusing malformed OpenRouter author: ${JSON.stringify(subjectSlug)}`
      )
    return trimmed
  }

  const slug = basePermaslug(trimmed)
  if (!isValidPermaslug(slug))
    throw new Error(
      `refusing malformed OpenRouter model: ${JSON.stringify(subjectSlug)}`
    )
  if (isCompositeSlug(slug))
    throw new Error(
      `refusing composite OpenRouter model classification: ${JSON.stringify(
        subjectSlug
      )}`
    )
  return slug
}

/** True only when the audited seed owns this exact subject key. */
export const isSeededLabClassification = (
  subjectType: LabClassificationSubjectType,
  subjectSlug: string,
  seed: LabShareClassifications = DEFAULT_LAB_SHARE_CLASSIFICATIONS
): boolean => {
  const slug = normalizeLabClassificationSubject(subjectType, subjectSlug)
  const chinese = subjectType === 'author' ? seed.chinese : seed.chineseModels
  const nonChinese =
    subjectType === 'author' ? seed.nonChinese : seed.nonChineseModels
  return own(chinese, slug) || own(nonChinese, slug)
}

/**
 * Authors with an exact-model rule are intentionally model-scoped. A broad
 * author click would defeat the reason the exception exists (notably the
 * shared `stealth/*` namespace), so discovery queues their individual models.
 */
export const isModelScopedLabAuthor = (
  author: string,
  classifications: LabShareClassifications = DEFAULT_LAB_SHARE_CLASSIFICATIONS
): boolean => {
  const normalized = normalizeLabClassificationSubject('author', author)
  return [
    ...Object.keys(classifications.chineseModels),
    ...Object.keys(classifications.nonChineseModels),
  ].some((model) => authorOfPermaslug(model) === normalized)
}

export type LabClassificationWriteValidation =
  | { ok: true; subjectSlug: string }
  | { ok: false; reason: string }

/**
 * Enforce the scope boundary at the shared write layer, not just in the UI.
 *
 * A model verdict is more specific than an author verdict. Consequently it is
 * also more powerful: without this check, a forged/stale request could insert
 * `deepseek/foo = non-Chinese` and override the audited DeepSeek author seed.
 * Exact DB rows are therefore allowed only under a namespace the audited seed
 * has explicitly marked model-scoped. Establishing a new such namespace is a
 * methodology change and starts with a reviewed exact-model seed entry.
 */
export const validateLabClassificationWrite = (
  subjectType: LabClassificationSubjectType,
  subjectSlug: string,
  seed: LabShareClassifications = DEFAULT_LAB_SHARE_CLASSIFICATIONS
): LabClassificationWriteValidation => {
  let slug: string
  try {
    slug = normalizeLabClassificationSubject(subjectType, subjectSlug)
  } catch (err) {
    return { ok: false, reason: `${err}` }
  }
  if (isSeededLabClassification(subjectType, slug, seed))
    return {
      ok: false,
      reason: `${subjectType} ${slug} is classified in the audited seed`,
    }

  const author = subjectType === 'author' ? slug : authorOfPermaslug(slug) ?? ''
  const modelScoped = isModelScopedLabAuthor(author, seed)
  if (subjectType === 'author' && modelScoped)
    return {
      ok: false,
      reason:
        `author ${author} is intentionally model-scoped; classify its ` +
        `individual model instead`,
    }
  if (subjectType === 'model' && !modelScoped)
    return {
      ok: false,
      reason:
        `author ${author} is author-scoped; an exact-model verdict could ` +
        `override its author classification`,
    }
  return { ok: true, subjectSlug: slug }
}

const evidenceText = (row: LabClassificationRow): string => {
  for (const key of ['evidence', 'summary', 'reasoning']) {
    const value = row.evidence?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return `${row.source} classification recorded ${
    row.classified_at ?? 'without a timestamp'
  }`
}

const rowEvidence = (row: LabClassificationRow): AuthorEvidence => ({
  evidence: evidenceText(row),
})

/**
 * Pure seed + DB merge, exported so precedence can be tested without a DB.
 *
 * Pending rows are ignored. A seed entry cannot be overridden by a DB row at
 * the same specificity. Model maps remain separate from author maps, allowing
 * the common scorer's exact-model-before-author precedence to do the rest.
 */
export const mergeLabClassificationRows = (
  rows: readonly LabClassificationRow[],
  seed: LabShareClassifications = DEFAULT_LAB_SHARE_CLASSIFICATIONS
): LabShareClassifications => {
  const classifications: MutableLabShareClassifications = {
    chinese: { ...seed.chinese },
    nonChinese: { ...seed.nonChinese },
    chineseModels: { ...seed.chineseModels },
    nonChineseModels: { ...seed.nonChineseModels },
  }

  for (const row of rows) {
    if (row.is_chinese === null) continue
    const validation = validateLabClassificationWrite(
      row.subject_type,
      row.subject_slug,
      seed
    )
    // Includes same-specificity seed rows, broad verdicts for a model-scoped
    // namespace, and exact verdicts under an ordinary author. Ignore on read
    // too, so a manually inserted/stale row cannot bypass the write invariant.
    if (!validation.ok) continue
    const slug = validation.subjectSlug

    const chinese =
      row.subject_type === 'author'
        ? classifications.chinese
        : classifications.chineseModels
    const nonChinese =
      row.subject_type === 'author'
        ? classifications.nonChinese
        : classifications.nonChineseModels
    const evidence = rowEvidence(row)
    if (row.is_chinese) {
      delete nonChinese[slug]
      setOwn(chinese, slug, evidence)
    } else {
      delete chinese[slug]
      setOwn(nonChinese, slug, evidence)
    }
  }
  return classifications
}

/** Resolve the exact classification snapshot one oracle tick should use. */
export const resolveLabClassifications = async (
  pg: SupabaseDirectClient
): Promise<LabShareClassifications> => {
  const rows = await pg.manyOrNone<LabClassificationRow>(
    `select subject_type, subject_slug, is_chinese, source, evidence,
            first_seen, first_ranked_at, classified_at, classified_by,
            updated_time
     from openrouter_lab_classifications
     where is_chinese is not null`
  )
  return mergeLabClassificationRows(rows)
}

const normalizePending = (
  subjects: readonly PendingLabClassification[]
): Array<PendingLabClassification & { normalizedSlug: string }> => {
  const unique = new Map<
    string,
    PendingLabClassification & {
      normalizedSlug: string
    }
  >()
  for (const subject of subjects) {
    let normalizedSlug: string
    try {
      normalizedSlug = normalizeLabClassificationSubject(
        subject.subjectType,
        subject.subjectSlug
      )
    } catch {
      // Catalog/rankings payloads are external data. A malformed entry should
      // fail scoring if ranked, but must not poison the entire discovery batch.
      continue
    }
    if (isSeededLabClassification(subject.subjectType, normalizedSlug)) continue
    const key = `${subject.subjectType}:${normalizedSlug}`
    const previous = unique.get(key)
    if (previous) {
      const earlierRankedAt = [previous.firstRankedAt, subject.firstRankedAt]
        .filter((value): value is number => value != null)
        .reduce<number | null>(
          (earliest, value) =>
            earliest == null ? value : Math.min(earliest, value),
          null
        )
      unique.set(key, { ...previous, firstRankedAt: earlierRankedAt })
      continue
    }
    unique.set(key, {
      ...subject,
      normalizedSlug,
    })
  }
  return [...unique.values()]
}

/**
 * Idempotently create review-queue rows.
 *
 * Conflict updates may fill an absent first_ranked_at for an existing pending
 * row, but never reset first_seen and never touch a decided row. This mirrors
 * the open-weight classifier's deadline semantics.
 */
export const recordPendingLabClassifications = async (
  pg: SupabaseDirectClient,
  subjects: readonly PendingLabClassification[],
  firstSeen = Date.now()
): Promise<number> => {
  const pending = normalizePending(subjects)
  if (pending.length === 0) return 0

  const firstSeenIso = new Date(firstSeen).toISOString()
  const result = await pg.result(
    `insert into openrouter_lab_classifications
       (subject_type, subject_slug, is_chinese, source, evidence,
        first_seen, first_ranked_at)
     select subject_type, subject_slug, null::boolean, 'auto', evidence::jsonb,
            $4::timestamptz, first_ranked_at::timestamptz
     from unnest($1::text[], $2::text[], $3::text[], $5::text[])
       as t(subject_type, subject_slug, evidence, first_ranked_at)
     on conflict (subject_type, subject_slug) do update set
       first_ranked_at = case
         when openrouter_lab_classifications.first_ranked_at is null
           then excluded.first_ranked_at
         else least(
           openrouter_lab_classifications.first_ranked_at,
           excluded.first_ranked_at
         )
       end,
       updated_time = now()
     where openrouter_lab_classifications.is_chinese is null
       and excluded.first_ranked_at is not null
       and (
         openrouter_lab_classifications.first_ranked_at is null or
         excluded.first_ranked_at <
           openrouter_lab_classifications.first_ranked_at
       )`,
    [
      pending.map((row) => row.subjectType),
      pending.map((row) => row.normalizedSlug),
      pending.map((row) => JSON.stringify(row.evidence ?? {})),
      firstSeenIso,
      pending.map((row) =>
        row.firstRankedAt == null
          ? null
          : new Date(row.firstRankedAt).toISOString()
      ),
    ]
  )
  // Inserts plus the one legitimate conflict update (filling/advancing the
  // earliest first-ranked timestamp), not merely the number attempted.
  return result.rowCount
}

export type LabCatalogModel = {
  permaslug: string
  name?: string | null
}

/**
 * Derive catalog queue entries without touching the database.
 *
 * Ordinary publishers yield one author row. Publishers already known to need
 * exact decisions yield model rows instead, so `stealth/new-preview` can never
 * invite a dangerously broad classification of every future `stealth/*` slug.
 */
export const pendingLabSubjectsFromCatalog = (
  models: readonly LabCatalogModel[],
  classifications: LabShareClassifications = DEFAULT_LAB_SHARE_CLASSIFICATIONS
): PendingLabClassification[] => {
  const authors = new Map<string, { models: string[]; names: string[] }>()
  for (const model of models) {
    if (isCompositeSlug(model.permaslug)) continue
    const permaslug = basePermaslug(model.permaslug)
    const author = authorOfPermaslug(permaslug)
    if (!author) continue
    const current = authors.get(author) ?? { models: [], names: [] }
    current.models.push(permaslug)
    if (model.name) current.names.push(model.name)
    authors.set(author, current)
  }

  const pending: PendingLabClassification[] = []
  for (const [author, context] of authors) {
    if (isModelScopedLabAuthor(author, classifications)) {
      for (const model of new Set(context.models)) {
        if (isSeededLabClassification('model', model, classifications)) continue
        pending.push({
          subjectType: 'model' as const,
          subjectSlug: model,
          evidence: {
            discoveredVia: 'catalog',
            openRouterName:
              models.find((entry) => basePermaslug(entry.permaslug) === model)
                ?.name ?? null,
          },
        })
      }
      continue
    }
    if (isSeededLabClassification('author', author, classifications)) continue
    pending.push({
      subjectType: 'author' as const,
      subjectSlug: author,
      evidence: {
        discoveredVia: 'catalog',
        relatedPermaslugs: [...new Set(context.models)].sort(),
        openRouterNames: [...new Set(context.names)].sort(),
      },
    })
  }
  return pending
}

export const recordPendingLabSubjectsFromCatalog = async (
  pg: SupabaseDirectClient,
  models: readonly LabCatalogModel[],
  firstSeen = Date.now(),
  classifications?: LabShareClassifications
): Promise<number> => {
  // Resolve when the caller does not already have a snapshot so settled DB
  // authors/models are filtered before the idempotent insert attempt.
  const resolved = classifications ?? (await resolveLabClassifications(pg))
  return recordPendingLabClassifications(
    pg,
    pendingLabSubjectsFromCatalog(models, resolved),
    firstSeen
  )
}

/**
 * Rankings fallback for subjects the catalog sweep did not catch.
 *
 * Unknown authors and their exact models are both retained: ordinary labs can
 * be classified once at author scope, while anonymous/shared author prefixes
 * can receive a narrow model verdict without misclassifying future releases.
 */
export const recordUnclassifiedLabSubjectsInRankings = async (
  pg: SupabaseDirectClient,
  params: {
    unknownAuthors: readonly string[]
    unknownModels: readonly string[]
  },
  rankedAt = Date.now()
): Promise<number> =>
  recordPendingLabClassifications(
    pg,
    [
      ...params.unknownAuthors.map((subjectSlug) => ({
        subjectType: 'author' as const,
        subjectSlug,
        evidence: { discoveredVia: 'rankings' },
        firstRankedAt: rankedAt,
      })),
      ...params.unknownModels.map((subjectSlug) => ({
        subjectType: 'model' as const,
        subjectSlug,
        evidence: { discoveredVia: 'rankings' },
        firstRankedAt: rankedAt,
      })),
    ],
    rankedAt
  )

/**
 * Atomically write a human verdict and preserve the previous state in
 * evidence.history. Seed entries are intentionally immutable through this
 * path; changing them remains a reviewed methodology edit.
 */
export const upsertLabClassification = async (
  pg: SupabaseDirectClient,
  params: LabClassificationSubject & {
    isChinese: boolean
    evidence: Record<string, unknown>
    classifiedBy: string
  }
): Promise<void> => {
  const validation = validateLabClassificationWrite(
    params.subjectType,
    params.subjectSlug
  )
  if (!validation.ok) throw new Error(validation.reason)
  const subjectSlug = validation.subjectSlug
  if (!params.classifiedBy.trim())
    throw new Error('classifiedBy is required for a human lab classification')
  const evidenceSummary = params.evidence?.['evidence']
  if (typeof evidenceSummary !== 'string' || !evidenceSummary.trim())
    throw new Error('evidence is required for a human lab classification')

  const evidence = {
    ...params.evidence,
    evidence: evidenceSummary.trim(),
  }

  await pg.none(
    `insert into openrouter_lab_classifications
       (subject_type, subject_slug, is_chinese, source, evidence,
        classified_at, classified_by, updated_time)
     values ($1, $2, $3, 'admin', $4::jsonb, now(), $5, now())
     on conflict (subject_type, subject_slug) do update set
       is_chinese = excluded.is_chinese,
       source = excluded.source,
       evidence = excluded.evidence || jsonb_build_object(
         'history',
         coalesce(
           openrouter_lab_classifications.evidence->'history', '[]'::jsonb
         ) || jsonb_build_array(jsonb_build_object(
           'isChinese', openrouter_lab_classifications.is_chinese,
           'source', openrouter_lab_classifications.source,
           'classifiedAt', openrouter_lab_classifications.classified_at,
           'classifiedBy', openrouter_lab_classifications.classified_by,
           'supersededAt', now(),
           'evidence', openrouter_lab_classifications.evidence - 'history'
         ))
       ),
       classified_at = excluded.classified_at,
       classified_by = excluded.classified_by,
       updated_time = now()`,
    [
      params.subjectType,
      subjectSlug,
      params.isChinese,
      JSON.stringify(evidence),
      params.classifiedBy.trim(),
    ]
  )
}

export const getLabClassificationRows = async (
  pg: SupabaseDirectClient
): Promise<LabClassificationRow[]> =>
  pg.manyOrNone<LabClassificationRow>(
    `select subject_type, subject_slug, is_chinese, source, evidence,
            first_seen, first_ranked_at, classified_at, classified_by,
            updated_time
     from openrouter_lab_classifications
     order by first_ranked_at asc nulls last, first_seen asc`
  )

export const getPendingLabClassifications = async (
  pg: SupabaseDirectClient
): Promise<LabClassificationRow[]> => {
  const rows = await pg.manyOrNone<LabClassificationRow>(
    `select subject_type, subject_slug, is_chinese, source, evidence,
            first_seen, first_ranked_at, classified_at, classified_by,
            updated_time
     from openrouter_lab_classifications
     where is_chinese is null
     order by first_ranked_at asc nulls last, first_seen asc`
  )
  return rows.filter((row) => {
    return validateLabClassificationWrite(row.subject_type, row.subject_slug).ok
  })
}
