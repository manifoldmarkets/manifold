import { APIHandler } from 'api/helpers/endpoint'
import { ContractComment } from 'common/comment'
import { convertContractComment } from 'common/supabase/comments'
import { parseJsonContentToText } from 'common/util/parse'
import { uniq } from 'lodash'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'
import { getContractsDirect } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  buildUserInterestsCache,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'
import { rateLimitByUser } from './helpers/rate-limit'

export const getBestComments: APIHandler<'get-best-comments'> = rateLimitByUser(
  async (props, auth) => {
    const { limit, ignoreContractIds } = props
    const userId = auth.uid
    const pg = createSupabaseDirectClient()
    const followedOnly = false
    //   await pg.one(
    //     `
    // select count(*) > 5 as followed_only
    // from user_follows
    // where user_id = $1`,
    //     [userId],
    //     (r) => r.followed_only
    //   )
    if (
      !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
    ) {
      await buildUserInterestsCache([userId])
    }

    let allComments: { comment: ContractComment; question: string }[]
    let commentsToReview: { comment: ContractComment; question: string }[] = []

    const introText = `
      I am a user of Manifold. Manifold is a prediction market platform where
      users place bets on current events, politics, tech, sports, AI, and more.
      I have some comments that I would like you to rank in order of descending quality.
      Evaluate quality based on their informativeness relevant to the question, cogent analysis, and optionally humor. 
    `
    const ignoreText = `
      Please ignore short, meme-y comments like:
      "Buy low, sell high", "Buy my bags", "what were y'all thinking?", just a link without any commentary, etc. 
      Also ignore housekeeping comments that are remotely similar, or along the same vein as lines like:
      "Add [such and such answer] @user",
      "This resolves [yes/no/n/a], because [x/y/z], etc",
      "How does [betting/other shares] work?",
      "What do you mean by [x/y/z] in your title?",
      "Odds down sharply on [x/y/z]"
      "I've improved the question by doing [x/y/z], what do you think now traders?",
      "Does anyone have evidence that this should resolve [yes/no]."
      "Extended close time",
      "How do you plan to [resolve/judge/etc.] this?",
      and any solo web links without additional commentary, etc.
    `
    if (followedOnly) {
      // Assuming getFollowedRecentComments is defined elsewhere
      commentsToReview = await pg.map(
        `
            select distinct on (cc.created_time) cc.data, c.question
            from contract_comments cc
                     join contracts c on cc.contract_id = c.id
                     join group_contracts gc on c.id = gc.contract_id
            where cc.created_time >= now() - interval '1 week'
              and cc.data ->> 'replyToCommentId' is null
              and cc.data ->> 'betId' is null
              and cc.data ->> 'answerOutcome' is null
              and c.close_time > now()
              and cc.user_id in (select follow_id
                                  from user_follows
                                  where user_id = $1)
              and ($2 is null or c.id not in ($2:list))
              and cc.comment_id not in (select comment_id
                                        from user_comment_view_events
                                        where user_id = $1)
            order by cc.created_time desc
            limit $3;
        `,
        [userId, ignoreContractIds?.length ? ignoreContractIds : null, 100],
        (row) => ({
          comment: convertContractComment(row.data),
          question: row.question,
        })
      )
      allComments = commentsToReview
    } else {
      const reviewLimit = 1000
      const interestedTopics = Object.entries(
        userIdsToAverageTopicConversionScores[userId]
      )
        .filter(([_, score]) => score > 0.5)
        .map(([groupId, _]) => groupId)

      allComments = await pg.map(
        `
            select distinct on (cc.created_time) cc.data, c.question
            from contract_comments cc
                     join contracts c on cc.contract_id = c.id
                     join group_contracts gc on c.id = gc.contract_id
            where cc.created_time >= now() - interval '1 week'
              and gc.group_id in (select unnest(array [$1]))
              and cc.data ->> 'replyToCommentId' is null
              and cc.data ->> 'betId' is null
              and cc.data ->> 'answerOutcome' is null
              and c.close_time > now()
              and cc.likes > 0
              and ($3 is null or c.id not in ($3:list))
              and cc.comment_id not in (select comment_id
                                        from user_comment_view_events
                                        where user_id = $2)
            order by cc.created_time desc
            limit $4;
        `,
        [
          interestedTopics,
          userId,
          ignoreContractIds?.length ? ignoreContractIds : null,
          reviewLimit,
        ],
        (row) => ({
          comment: convertContractComment(row.data),
          question: row.question,
        })
      )

      const batchSize = 25
      const totalBatches = Math.ceil(allComments.length / batchSize)

      const processBatch = async (batch: typeof allComments) => {
        const batchPrompt = `
          ${introText}
          ${ignoreText}
          \n
          ${batch
            .map(
              ({ question, comment }) => `
          ----
          Question: ${question}
          Comment ID: ${comment.id}
          Comment: ${parseJsonContentToText(comment.content)}
          ----
          `
            )
            .join('\n')}
          Please evaluate quality based on informativeness relevant to the question, cogent analysis, and optionally humor. 
          ${ignoreText}
          Pick the best comment that you think a user might want to read based on the quality of the information
          conveyed. Do NOT pick any comments that don't meet the minimum quality bar. 
          Only return to me the comment ID, (ie don't say here is my top comment, just give me the ID)
        `

        const batchMsgContent = await promptAI(batchPrompt, {
          model: aiModels.flash,
        })
        const batchCommentIds = batchMsgContent
          ? batchMsgContent
              .split(',')
              .map((s: string) => s.trim())
              .map((s: string) => s.replace(',', ''))
          : []

        return batch.filter((c) => batchCommentIds.includes(c.comment.id))
      }

      const batchPromises = []
      for (let i = 0; i < totalBatches; i++) {
        const batch = allComments.slice(i * batchSize, (i + 1) * batchSize)
        batchPromises.push(processBatch(batch))
      }

      const batchResults = await Promise.all(batchPromises)
      commentsToReview = batchResults.flat().slice(0, 100)
    }

    const prompt = `
      ${introText}
      ${ignoreText}
      \n
      ${commentsToReview
        .map(
          ({ question, comment }) => `
      ----
      Question: ${question}
      Comment ID: ${comment.id}
      Comment: ${parseJsonContentToText(comment.content)}
      ----
      `
        )
        .join('\n')}
      Please evaluate quality based on informativeness relevant to the question, cogent analysis, and optionally humor. 
      ${ignoreText}
      Now, you don't have to respond with ${limit} if there aren't ${limit} good comments, only
      respond with the highest quality comments you see.
      So, what are the highest quality ~${limit} comment IDs separated by commas, in order
      of descending quality? (ie don't say here are my top comments, just give me the IDs)
    `
    const chosenComments = await promptAI(prompt, { model: aiModels.flash })
    const commentIds = chosenComments
      ? chosenComments
          .split(',')
          .map((s: string) => s.trim())
          .map((s: string) => s.replace(',', ''))
      : []

    const comments = allComments
      .filter((c) => commentIds.includes(c.comment.id))
      .map((c) => c.comment)
      .slice(0, limit)
    const contracts = await getContractsDirect(
      uniq(comments.map((c) => c.contractId)),
      pg
    )

    return {
      comments,
      contracts,
    }
  }
)
