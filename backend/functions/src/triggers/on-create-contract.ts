import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as sharp from 'sharp'
import { JSONContent } from '@tiptap/core'

import { getUser, log } from 'shared/utils'
import { Contract } from 'common/contract'
import { parseMentions, richTextToString } from 'common/util/parse'
import { addUserToContractFollowers } from 'shared/follow-market'

import { secrets } from 'common/secrets'
import { completeCalculatedQuestFromTrigger } from 'shared/complete-quest-internal'
import { addContractToFeed } from 'shared/create-feed'
import { createNewContractNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'
import {
  generateContractEmbeddings,
  isContractNonPredictive,
} from 'shared/supabase/contracts'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { UNRANKED_GROUP_ID } from 'common/supabase/groups'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { generateImage } from 'shared/helpers/openai-utils'
import { randomString } from 'common/util/random'

export const onCreateContract = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .firestore.document('contracts/{contractId}')
  .onCreate(async (snapshot, context) => {
    const { eventId } = context

    const contract = snapshot.data() as Contract
    const { creatorId, question, loverUserId1, creatorUsername } = contract

    const contractCreator = await getUser(creatorId)
    if (!contractCreator) throw new Error('Could not find contract creator')

    if (!loverUserId1) {
      const dalleImage = await generateImage(question)
      if (dalleImage) {
        await uploadToStorage(dalleImage, creatorUsername)
          .then((coverImageUrl) => snapshot.ref.update({ coverImageUrl }))
          .catch((err) => console.error('Failed to load image', err))
      }
    }

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
    if (isContractNonPredictive(contract)) {
      const added = await addGroupToContract(
        contract,
        {
          id: UNRANKED_GROUP_ID,
          slug: 'nonpredictive',
          name: 'Unranked',
        },
        HOUSE_LIQUIDITY_PROVIDER_ID
      )
      log('Added contract to unranked group', added)
    }
    if (contract.visibility === 'unlisted') return
    await addContractToFeed(
      contract,
      [
        'follow_user',
        'similar_interest_vector_to_contract',
        'contract_in_group_you_are_in',
      ],
      'new_contract',
      [contractCreator.id],
      {
        idempotencyKey: contract.id + '_new_contract',
      }
    )
    const groupIds = (contract.groupLinks ?? []).map((gl) => gl.groupId)
    await Promise.all(
      groupIds.map(async (groupId) => upsertGroupEmbedding(pg, groupId))
    )
  })

export const uploadToStorage = async (imgUrl: string, username: string) => {
  const response = await fetch(imgUrl)

  const arrayBuffer = await response.arrayBuffer()
  const inputBuffer = Buffer.from(arrayBuffer)

  const buffer = await sharp(inputBuffer)
    .toFormat('jpeg', { quality: 60 })
    .toBuffer()

  const bucket = admin.storage().bucket()

  const file = bucket.file(`contract-images/${username}/${randomString()}.jpg`)

  const stream = file.createWriteStream({
    metadata: {
      contentType: 'image/jpg',
      predefinedAcl: 'publicRead',
    },
  })

  stream.on('error', (err) => {
    console.error(err)
  })

  stream.on('finish', () => {
    console.log('Image upload completed')
  })

  stream.end(buffer)

  const url = await file.publicUrl()
  return url
}
