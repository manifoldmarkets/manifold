import * as admin from 'firebase-admin'
import * as sharp from 'sharp'
import { JSONContent } from '@tiptap/core'
import { getUser, log } from 'shared/utils'
import { Contract } from 'common/contract'
import { parseMentions, richTextToString } from 'common/util/parse'
import { addUserToContractFollowers } from 'shared/follow-market'
import { completeCalculatedQuestFromTrigger } from 'shared/complete-quest-internal'
import { createNewContractNotification } from 'shared/create-notification'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'
import {
  generateContractEmbeddings,
  isContractNonPredictive,
  updateContract,
} from 'shared/supabase/contracts'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import {
  UNRANKED_GROUP_ID,
  UNSUBSIDIZED_GROUP_ID,
} from 'common/supabase/groups'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { randomString } from 'common/util/random'
import { generateImage as generateMarketBanner } from 'shared/helpers/stability-utils'
import { MarketTierType } from 'common/tier'

export const onCreateMarket = async (
  contract: Contract,
  triggerEventId?: string
) => {
  const { creatorId, question, creatorUsername } = contract
  const eventId = triggerEventId ?? contract.id + '-on-create'
  const contractCreator = await getUser(creatorId)
  if (!contractCreator) throw new Error('Could not find contract creator')

  await completeCalculatedQuestFromTrigger(
    contractCreator,
    'MARKETS_CREATED',
    eventId,
    contract.id
  )
  const desc = contract.description as JSONContent
  const mentioned = parseMentions(desc)
  await addUserToContractFollowers(contract.id, contractCreator.id)

  await createNewContractNotification(
    contractCreator,
    contract,
    eventId,
    richTextToString(desc),
    mentioned
  )
  const pg = createSupabaseDirectClient()

  const embedding = await pg.oneOrNone(
    `select embedding
              from contract_embeddings
              where contract_id = $1`,
    [contract.id]
  )
  if (!embedding) await generateContractEmbeddings(contract, pg)
  const isNonPredictive = isContractNonPredictive(contract)
  if (isNonPredictive) {
    await addGroupToContract(
      pg,
      contract,
      {
        id: UNRANKED_GROUP_ID,
        slug: 'nonpredictive',
      },
      HOUSE_LIQUIDITY_PROVIDER_ID
    )
    await addGroupToContract(
      pg,
      contract,
      {
        id: UNSUBSIDIZED_GROUP_ID,
        slug: 'unsubsidized',
      },
      HOUSE_LIQUIDITY_PROVIDER_ID
    )
    log('Added contract to unsubsidized group')
  }
  if (contract.visibility === 'public') {
    const groupIds = await pg.map(
      `select group_id from group_contracts where contract_id = $1`,
      [contract.id],
      (data) => data.group_id
    )

    await Promise.all(
      groupIds.map(async (groupId) => upsertGroupEmbedding(pg, groupId))
    )
  }

  let answerList: string[] = []
  if ('answers' in contract) {
    answerList = contract.answers.map((a) => a.text)
  }

  await uploadAndSetCoverImage(pg, question, desc, answerList, contract.id, creatorUsername, contract.marketTier ?? 'basic')
}

const uploadAndSetCoverImage = async (
  pg: SupabaseDirectClient,
  question: string,
  desc: JSONContent,
  answerList: string[],
  contractId: string,
  creatorUsername: string,
  marketTier: MarketTierType
) => {
  const description = richTextToString(desc) as string
  const formattedAnswers = "Possible answers:" + answerList.join(', ') + "\n\n"
  const questionDescription = `Question: ${question}\n\nAdditional detail: ${description.slice(500)}\n\n${answerList.length != 0 ? formattedAnswers : ''}`
  const highTier: boolean = ['plus', 'premium', 'crystal'].includes(marketTier)

  const bannerImage = await generateMarketBanner(questionDescription, highTier)
  if (!bannerImage) return

  console.log('generated cover image: ' + bannerImage)

  const coverImageUrl = await uploadToStorage(
    bannerImage,
    creatorUsername
  ).catch((err) => {
    console.error('Failed to load image', err)
    return null
  })
  if (!coverImageUrl) return

  await updateContract(pg, contractId, { coverImageUrl })
}

export const uploadToStorage = async (img: ArrayBuffer, username: string) => {
  const inputBuffer = Buffer.from(img)

  const buffer = await sharp(inputBuffer)
    .toFormat('jpeg', { quality: 60 })
    .toBuffer()

  const bucket = admin.storage().bucket()
  await bucket.makePublic()

  const file = bucket.file(`contract-images/${username}/${randomString()}.jpg`)

  return new Promise<string>((resolve, reject) => {
    const stream = file.createWriteStream({
      metadata: {
        contentType: 'image/jpg',
        predefinedAcl: 'publicRead',
      },
    })

    stream.on('error', (err) => {
      reject(err)
    })

    stream.on('finish', () => {
      console.log('Image upload completed')
      const url = file.publicUrl()
      resolve(url.replace(/%2F/g, '/'))
    })

    stream.end(buffer)
  })
}
