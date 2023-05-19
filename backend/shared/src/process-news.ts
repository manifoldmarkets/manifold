import { SupabaseClient } from 'common/supabase/utils'
import { IDatabase } from 'pg-promise'
import { IClient } from 'pg-promise/typescript/pg-subset'
import { generateEmbeddings } from 'shared/helpers/openai-utils'

export const processNews = async (
  apiKey: string,
  db: SupabaseClient,
  pg: IDatabase<IClient, IClient>
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
    await processNewsArticle(article, lastPublished, db, pg)
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
  pg: IDatabase<IClient, IClient>
) => {
  const publishedAtDate = new Date(publishedAt)
  if (publishedAtDate <= lastPublished) {
    console.log('Skipping', title)
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

  const { data } = await db.rpc('search_contract_embeddings' as any, {
    query_embedding: embedding,
    similarity_threshold: 0.825, // hand-selected; don't change unless you know what you're doing
    match_count: 5,
  })

  const getContract = (cid: string) =>
    db
      .from('contracts')
      .select('data')
      .eq('id', cid)
      .then((r) => (r?.data as any)[0].data)

  const contractsIds = (data as any).map((d: any) => d.contract_id)

  const questions = await Promise.all(contractsIds.map(getContract))
  if (questions.length === 0) {
    console.log('No related markets found\n\n')
    return
  }

  console.log('Markets:')
  for (const q of questions) {
    console.log(q.question)
  }
  console.log()
  console.log()

  await pg
    .none(
      'insert into news (title, url, published_time, author, description, image_url, source_id, source_name, title_embedding, contract_ids) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
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
        contractsIds,
      ]
    )
    .catch((err) => console.error(err))
}
