import { APIHandler } from 'api/helpers/endpoint'
import {
  buildUserInterestsCache,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContractComment } from 'common/supabase/comments'
import { parseJsonContentToText } from 'common/util/parse'
import { getContractsDirect } from 'shared/supabase/contracts'
import { uniq } from 'lodash'
import { promptGPT4 } from 'shared/helpers/openai-utils'

export const getBestComments: APIHandler<'get-best-comments'> = async (
  props,
  auth
) => {
  const { limit, offset, ignoreContractIds, justLikes } = props
  const userId = auth.uid
  const pg = createSupabaseDirectClient()

  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    await buildUserInterestsCache([userId])
  }

  let recentComments
  let commentIds: string[]
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length ||
    justLikes
  ) {
    recentComments = await pg.map(
      `
    select distinct on (cc.likes, cc.comment_id) cc.data, c.question
    from contract_comments cc
    join contracts c on cc.contract_id = c.id
    join group_contracts gc on c.id = gc.contract_id
    where cc.created_time >= now() - interval '1 month'
    and cc.data->>'replyToCommentId' is null
    and cc.data->>'betId' is null
    and cc.data->>'answerOutcome' is null
    and c.close_time > now()
    and cc.likes > 0
    and cc.comment_id not in (
        select comment_id from user_comment_view_events
        where user_id = $1
    )
    order by cc.likes desc, cc.comment_id
    offset $2
    limit $3;
    `,
      [userId, offset * limit, limit],
      (row) => ({
        comment: convertContractComment(row.data),
        question: row.question,
      })
    )
    commentIds = recentComments.map((c) => c.comment.id)
  } else {
    const interestedTopics = Object.entries(
      userIdsToAverageTopicConversionScores[userId]
    )
      .filter(([_, score]) => score > 0.5)
      .map(([groupId, _]) => groupId)

    const tastyCommentIds = [
      'qlqkhe9ubxh',
      'bs8bosj4upc',
      'berl2gp0359',
      'k8dq25hmxl',
      '275vda80j8n',
      '0wv0naxye9om',
      'bdw790uowdt',
      'dnvvl1l36sa',
      '3hn3hdokb1o',
      '1ofGWIzbxMzEDBmkwTMj',
      '0cd09bnhr68',
      '3uzylixbmq8',
    ]
    const likedComments = await pg.map(
      `
          select contracts.question, cc.data as comment
          from contract_comments cc
                   join contracts on cc.contract_id = contracts.id
          where cc.comment_id in ($1:list)
      `,
      [tastyCommentIds],
      (row) => ({
        question: row.question,
        comment: convertContractComment(row.comment),
      })
    )
    recentComments = await pg.map(
      `
          select distinct on (cc.created_time) cc.data, c.question
          from contract_comments cc
                   join contracts c on cc.contract_id = c.id
                   join group_contracts gc on c.id = gc.contract_id
          where cc.created_time >= now() - interval '1 month'
            and gc.group_id in (select unnest(array [$1]))
            and cc.comment_id not in ($2:list)
            and cc.data ->> 'replyToCommentId' is null
            and cc.data ->> 'betId' is null
            and cc.data ->> 'answerOutcome' is null
            and c.close_time > now()
            and cc.likes > 0
            and ($3 is null or c.id not in ($3:list))
            and cc.comment_id not in (select comment_id
                                      from user_comment_view_events
                                      where user_id = $4)
          order by cc.created_time desc
          limit 100;
      `,
      [
        interestedTopics,
        likedComments.map((c) => c.comment.id),
        ignoreContractIds?.length ? ignoreContractIds : null,
        userId,
      ],
      (row) => ({
        comment: convertContractComment(row.data),
        question: row.question,
      })
    )

    const groupedComments: Record<
      string,
      Array<{ id: string; content: string }>
    > = {}
    for (const { question, comment } of recentComments) {
      if (!groupedComments[question]) {
        groupedComments[question] = []
      }
      groupedComments[question].push({
        id: comment.id,
        content: parseJsonContentToText(comment.content),
      })
    }

    const content = `
      Hello Claude, I am a user of Manifold. Manifold is a prediction market platform where
      users place bets on on current events, politics, tech, sports, AI, and more.
      I'm going to give you a sample of comments on questions that I liked. They may include some
      comments that you can safely ignore, like: 'This resolves NO, the event has happened' for example.
      Next, I'll give you some other comments with their questions attached that I would like
      to rank in order of quality. Here are the comments I liked:
      ${likedComments
        .map(
          (c) =>
            `\n----\n
            Question: ${c.question}\n
            Comment: ${parseJsonContentToText(c.comment.content)} 
            \n----`
        )
        .join('\n')}
      \n\n
      Now here are some other comments that I would like you to rank in order of quality.
      Evaluate quality based on their informativeness relevant to the question, cogent analysis, and whatever
      else you might think is important based on my previous likes, (it could be humor!). 
      Please ignore short, meme-y comments like:
      "Buy low, sell high", "Buy my bags", "what were y'all thinking?", just a link without any commentary, etc. 
      Also ignore nuts-and-bolds comments like:
      "Add [such and such answer] @user", "This resolves [yes/no/n/a, because etc]",
      "How does [betting/other shares] work?",
      "What do you mean by [x/y/z] in your title?",
      and any solo web links without additional commentary, etc.
      \n
      ${Object.entries(groupedComments)
        .map(
          ([question, comments]) =>
            `\n----\n
          Question: ${question}\n\n
          ${comments
            .map(
              (comment) =>
                `Comment ID: ${comment.id} \n
            Comment: ${comment.content}\n`
            )
            .join('\n')}
          \n----\n`
        )
        .join('\n')}
      Please pick no more than 2-3 comments per unique question title, evaluate quality
      based on their informativeness relevant to the question, cogent analysis, and whatever
      else you might think is important based on my previous likes, (it could be humor!). 
      Remember, ignore short or meme-y comments like:
      "Buy low, sell high", "I'm holding onto my YES bags", "what were people/you all thinking?", etc. 
      Also ignore nuts-and-bolds comments like:
      "Add [such and such answer] @user", "This resolves [yes/no/n/a, because etc]",
      "How does [betting/other shares] work?",
      "What do you mean by [x/y/z] in your title?",
      and any solo web links without additional commentary, etc.
      Now, you don't have to respond with ${limit} if there aren't ${limit} good comments,
      what are the highest quality ~${limit} comment IDs separated by commas, in order
      of descending quality? (ie don't say here are my top comments, just give me the IDs)
      `
    // anthropic:
    // const anthropic = new Anthropic({
    //   apiKey: process.env.ANTHROPIC_API_KEY,
    // })
    // const msg = await anthropic.messages.create({
    //   model: 'claude-3-5-sonnet-20240620',
    //   max_tokens: 1024,
    //   messages: [{ role: 'user', content }],
    // })
    // const msgContent = first(msg.content)
    // commentIds =
    //   msgContent && msgContent.type === 'text'
    //     ? msgContent.text
    //       .split(',')
    //       .map((s) => s.trim())
    //       .map((s) => s.replace(',', ''))
    //     : []

    // openai:
    const msgContent = await promptGPT4(content)
    commentIds = msgContent
      ? msgContent
          .split(',')
          .map((s) => s.trim())
          .map((s) => s.replace(',', ''))
      : []
  }
  const comments = recentComments
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
