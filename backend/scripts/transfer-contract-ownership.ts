import { createSupabaseClient } from 'shared/supabase/init'

import { runScript } from './run-script'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

interface Args {
  slugs: string[]
  toUserId: string
}

interface User {
  id: string
  username: string
  name: string
  created_time: string
}

interface Contract {
  id: string
  data: any
}

const supabaseClient = createSupabaseClient()

const argv = yargs(hideBin(process.argv))
  .option('slugs', {
    alias: 's',
    type: 'array',
    description: 'List of slugs to transfer',
    demandOption: true,
  })
  .option('toUserId', {
    alias: 'u',
    type: 'string',
    description: 'User ID to transfer contracts to',
    demandOption: true,
  })
  .parseSync() as Args

const BATCH_SIZE = 20

if (require.main === module) {
  runScript(async () => {
    const { slugs: slugsToTransfer, toUserId } = argv

    const { data: toUserData, error: userError } = await supabaseClient
      .from('users')
      .select('id, username, name, created_time')
      .eq('id', toUserId)
      .single()

    if (userError) {
      console.error('Error fetching user:', userError)
      return
    }

    if (!toUserData) {
      console.error('User not found')
      return
    }

    const toUser: User = toUserData as unknown as User

    const { data: contractsData, error: contractsError } = await supabaseClient
      .from('contracts')
      .select('id, data')
      .in('slug', slugsToTransfer)

    if (contractsError) {
      console.error('Error fetching contracts:', contractsError)
      return
    }

    if (!contractsData) {
      console.error('No contracts found')
      return
    }

    const contractsToTransfer: Contract[] =
      contractsData as unknown as Contract[]

    console.log(
      `Transferring ${contractsToTransfer.length} contracts to ${toUser.name}`
    )

    for (let i = 0; i < contractsToTransfer.length; i += BATCH_SIZE) {
      const batch = contractsToTransfer.slice(i, i + BATCH_SIZE)

      const updates = batch.map(({ id, data }) => {
        const description = data.description || ''
        const creatorUsername = data.creatorUsername || 'Unknown creator'
        const creatorName = data.creatorName || 'Unknown name'

        const updatedDescription = `${
          description ? description : ''
        }\n\nThis market was created by ${creatorUsername} (${creatorName}) and has changed ownership.`

        return {
          id,
          creator_id: toUser.id,
          created_time: toUser.created_time,
          data: {
            ...data,
            description: updatedDescription,
            creatorUsername: toUser.username,
            creatorName: toUser.name,
            creatorAvatarUrl: data.creatorAvatarUrl,
          },
        }
      })

      const { error: upsertError } = await supabaseClient
        .from('contracts')
        .upsert(updates)

      if (upsertError) {
        console.error('Error performing bulk upsert:', upsertError)
      }
    }

    console.log('done.')
  })
}
