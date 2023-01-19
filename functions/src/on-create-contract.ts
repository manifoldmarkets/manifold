import * as functions from 'firebase-functions'

import { getUser } from './utils'
import { createNewContractNotification } from './create-notification'
import { Contract } from '../../common/contract'
import { parseMentions, richTextToString } from '../../common/util/parse'
import { JSONContent } from '@tiptap/core'
import { addUserToContractFollowers } from './follow-market'

import { dreamWithDefaultParams } from './dream-utils'
import { generateEmbeddings } from './helpers/openai-utils'
import { createSupabaseClient } from './supabase/init'
import { run } from '../../common/supabase/utils'

export const onCreateContract = functions
  .runWith({ secrets: ['MAILGUN_KEY', 'DREAM_KEY', 'OPENAI_API_KEY', 'SUPABASE_KEY'] })
  .firestore.document('contracts/{contractId}')
  .onCreate(async (snapshot, context) => {
    const contract = snapshot.data() as Contract
    const { eventId } = context

    const contractCreator = await getUser(contract.creatorId)
    if (!contractCreator) throw new Error('Could not find contract creator')

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

    const coverImageUrl = await dreamWithDefaultParams(contract.question)
    await snapshot.ref.update({
      coverImageUrl,
    })

    const embeddings = await generateEmbeddings(contract.question)
    if (!embeddings) return

    const db = createSupabaseClient()
    await run(
      db
        .from('contract_embeddings')
        .insert({ contract_id: contract.id, embeddings })
    )
  })
