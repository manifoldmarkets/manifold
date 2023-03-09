import { PineconeClient } from 'pinecone-client'

const pinecone = new PineconeClient({
  apiKey: process.env.PINECONE_API_KEY,
  baseUrl: process.env.PINECONE_ENDPOINT,
})

export const saveVector = async (
  id: string,
  vector: number[],
  metadata = {}
) => {
  await pinecone.upsert({
    vectors: [
      {
        id,
        values: vector,
        metadata,
      },
    ],
  })
}

export const closestVectorById = async (
  id: string,
  topK = 2,
  includeMetadata = false
) => {
  return await pinecone.query({
    topK,
    id,
    includeMetadata,
  })
}

export const closestVector = async (
  vector: number[],
  topK = 2,
  includeMetadata = false
) => {
  return await pinecone.query({
    topK,
    vector,
    includeMetadata,
  })
}
