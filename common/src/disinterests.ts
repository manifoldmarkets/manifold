// What "Uninterested" means, in one place, so the feed, the API and the UI
// copy agree. Marking a market uninterested does three things for that user:
// the market leaves their feeds, near-identical markets leave their feeds (now
// and as they are created), and the market's topics weigh less in their feed
// ranking for a while. Search is deliberately untouched: someone who types the
// words wants the market.

/**
 * Cosine similarity above which another market counts as a near-duplicate of
 * one the user marked uninterested.
 *
 * Calibrated on prod text-embedding-3-small vectors (2026-10-03). The same
 * question template with a changed number or date scores 0.92–0.98:
 *   "…approval rating hit 37% or lower before Dec 1st 2026" vs "…38%…"   0.977
 *   "US Average Gas Price Is $4.38 or more on October 5" vs "$4.42"      0.983
 *   "Do you like 94% odds?" vs "Do you like 96% odds?"                  0.942
 *   "…solve a Millennium Prize Problem before 2030" vs "…2035"           0.978
 * Related but genuinely different questions top out near 0.87:
 *   "2026 Ebola epidemic deaths?" vs "2026 Ebola epidemic case count?"  0.864
 *   "GPT-6.1+ Astra released in October?" vs "…By End of November?"     0.873
 * The same NFL matchup on a different date is only ~0.79 and a different
 * opponent ~0.65, so sports series are left to the topic penalty below.
 */
export const NEAR_DUPLICATE_SIMILARITY_THRESHOLD = 0.9

/**
 * Most near-duplicates hidden per mark. A daily series can have hundreds of
 * instances; the open ones are what matter and there are rarely many.
 */
export const MAX_NEAR_DUPLICATES_PER_DISINTEREST = 50

/**
 * How many nearest neighbours to pull from the embedding index before
 * filtering to markets a feed could still show. HNSW returns at most
 * hnsw.ef_search rows (40 in prod), and in a daily series the resolved
 * instances are at least as close as the open ones.
 */
export const NEAR_DUPLICATE_CANDIDATE_LIMIT = 200

/** Each market the user marked uninterested halves the feed weight of its topics… */
export const DISINTEREST_TOPIC_PENALTY = 0.5

/**
 * …down to this floor. "Show less" must never silently become a block;
 * blocking a topic is a separate, explicit action the user can see and undo.
 */
export const MIN_DISINTEREST_TOPIC_MULTIPLIER = 0.05

/**
 * Only marks this recent count toward the topic penalty. Hiding the market
 * itself is permanent, but a dislike of a whole topic should be allowed to
 * fade as the user's engagement changes.
 */
export const DISINTEREST_TOPIC_WINDOW_DAYS = 180

export const disinterestTopicMultiplier = (uninterestedMarketCount: number) => {
  if (
    !Number.isFinite(uninterestedMarketCount) ||
    uninterestedMarketCount < 1
  ) {
    return 1
  }
  return Math.max(
    Math.pow(DISINTEREST_TOPIC_PENALTY, Math.floor(uninterestedMarketCount)),
    MIN_DISINTEREST_TOPIC_MULTIPLIER
  )
}

export type TopicScores = { [topicId: string]: number }

/**
 * Weighs down the topics of markets the user marked uninterested. A topic the
 * user has no score for yet starts from `prior`: otherwise a market tagged only
 * with topics the user never engaged with would rank as if nothing had been
 * said about it. Returns a new object; the input may be a shared cache.
 */
export const applyDisinterestTopicPenalty = (
  scores: TopicScores,
  uninterestedMarketCountsByTopic: TopicScores,
  prior: number
): TopicScores => {
  const adjusted: TopicScores = { ...scores }
  for (const topicId of Object.keys(uninterestedMarketCountsByTopic)) {
    const multiplier = disinterestTopicMultiplier(
      uninterestedMarketCountsByTopic[topicId]
    )
    if (multiplier === 1) continue
    const current = adjusted[topicId]
    const base = Number.isFinite(current) ? current : prior
    adjusted[topicId] = base * multiplier
  }
  return adjusted
}
