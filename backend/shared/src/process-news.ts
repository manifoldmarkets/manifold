import { SupabaseClient } from 'common/supabase/utils'
import { IDatabase } from 'pg-promise'
import { IClient } from 'pg-promise/typescript/pg-subset'
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { insertNewsToUsersFeeds } from 'shared/create-feed'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { DEEMPHASIZED_GROUP_SLUGS } from 'common/envs/constants'

export const processNews = async (
  apiKey: string,
  db: SupabaseClient,
  pg: IDatabase<IClient, IClient>,
  readOnly = false
) => {
  const lastPublished = await getLastPublished(db)
  console.log('Last published time:', lastPublished?.toLocaleString())

  const url = `https://newsapi.org/v2/top-headlines?country=us&apiKey=${apiKey}&pageSize=100`

  const articles: NewsArticle[] = await fetch(url)
    .then((response) => response.json())
    .then((data) => {
      return data.articles
    })
    .catch((error) => {
      console.error('Error loading articles', error)
      return []
    })

  if (!articles.length) return
  console.log('Loaded', articles.length, 'articles')

  for (const article of articles) {
    await processNewsArticle(article, lastPublished, db, pg, readOnly)
  }
}

interface NewsArticle {
  title: string
  url: string
  author?: string
  description?: string
  urlToImage?: string
  publishedAt: string
  source: {
    id?: string
    name?: string
  }
}

const getLastPublished = async (db: SupabaseClient) => {
  const { data } = await db
    .from('news')
    .select('published_time')
    .order('published_time', { ascending: false })
    .limit(1)

  const lastPublishedTimestamp = data?.[0]?.published_time ?? 0
  return new Date(lastPublishedTimestamp)
}

const processNewsArticle = async (
  {
    title,
    url,
    author,
    description,
    urlToImage,
    publishedAt,
    source,
  }: NewsArticle,
  lastPublished: Date,
  db: SupabaseClient,
  pg: IDatabase<IClient, IClient>,
  readOnly: boolean
) => {
  const publishedAtDate = new Date(publishedAt)
  if (publishedAtDate <= lastPublished) {
    console.log('Skipping', title)
    return
  }

  if (url.includes('youtube.com')) {
    console.log('Skipping youtube video', title)
    return
  }

  if (title.toLowerCase().includes('horoscope')) {
    console.log('Skipping horoscope', title)
    return
  }

  const cleanTitle = title.split(' - ')[0]
  console.log(cleanTitle)

  const embedding = await generateEmbeddings(cleanTitle)
  if (!embedding || embedding.length < 1500) {
    console.log('No embeddings for', cleanTitle)
    return
  }
  console.log('Embedding generated. Searching...')

  const { data: groupsData } = await db.rpc('search_group_embeddings', {
    query_embedding: embedding as any,
    similarity_threshold: 0.825, // hand-selected; don't change unless you know what you're doing
    max_count: 20,
    name_similarity_threshold: 0.6,
  })

  const groups =
    groupsData && groupsData.length > 0
      ? await pg.map(
          `
            select data, id, importance_score from groups where id in ($1:list)
              and privacy_status = 'public'
              and slug not in ($2:list)
              and total_members > 1
              order by importance_score desc
          `,
          [groupsData.flat().map((g) => g.group_id), DEEMPHASIZED_GROUP_SLUGS],
          (r) => {
            const data = r.data as Group
            return { ...data, id: r.id, importanceScore: r.importance_score }
          }
        )
      : []

  console.log('Groups found:', groups.map((g) => g.name).join(', '))
  console.log('Group slugs:', groups.map((g) => g.slug).join(', '))

  const { data } = await db.rpc('search_contract_embeddings', {
    query_embedding: embedding as any,
    similarity_threshold: 0.825, // hand-selected; don't change unless you know what you're doing
    match_count: 20,
  })

  const contracts: Contract[] =
    data && data.length > 0
      ? await pg.map(
          `
        select data from contracts where id in ($1:list)
        `,
          [data?.flat().map((c) => c.contract_id)],
          (r) => r.data as Contract
        )
      : []

  const questions = contracts
    .filter(
      (c) =>
        c.outcomeType !== 'STONK' &&
        !c.isResolved &&
        c.visibility === 'public' &&
        c.importanceScore
    )
    // sort in descending order of importance score
    .sort((a, b) => b.importanceScore - a.importanceScore)
    .slice(0, 5)

  if (questions.length === 0 && groups.length === 0) {
    console.log('No related markets nor groups found\n\n')
    return
  }

  console.log('Markets:')
  for (const q of questions) {
    console.log(q.question)
  }
  console.log()
  console.log()

  if (readOnly) return

  const newsRowJustId = await pg
    .one<{ id: number }>(
      'insert into news (title, url, published_time, author, description, image_url, source_id, source_name, title_embedding, contract_ids, group_ids) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id',
      [
        cleanTitle,
        url,
        publishedAt,
        author,
        description,
        urlToImage,
        source.id ?? null,
        source.name ?? null,
        embedding,
        contracts.map((c) => c.id),
        groups.map((g) => g.id),
      ]
    )
    .catch((err) => console.error(err))

  const newsId = newsRowJustId?.id.toString()
  if (!newsId) return
  console.log(
    'inserted news with id:',
    newsId,
    'adding to feed now with published date',
    publishedAtDate.toISOString()
  )

  await insertNewsToUsersFeeds(
    newsId,
    questions,
    groups,
    publishedAtDate.valueOf(),
    pg
  )
}
