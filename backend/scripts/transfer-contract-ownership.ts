import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'

import { runScript } from './run-script'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// Define types for command-line arguments
interface Args {
  slugs: string[]
  toUserId: string
}

// Define types for the fetched data
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

// Initialize Supabase client
const supabaseClient = createSupabaseClient()

// Parse command-line arguments
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

const BATCH_SIZE = 10 // Adjust batch size as needed

if (require.main === module) {
  runScript(async () => {
    const { slugs: slugsToTransfer, toUserId } = argv

    // Fetch the new user details
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

    // Fetch contract IDs and their current descriptions to transfer based on slugs
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

    // Process contracts in batches using upsert
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
            creatorUsername: toUser.username, // Update creatorUsername in data
            creatorName: toUser.name, // Update creatorName in data
            creatorAvatarUrl: data.creatorAvatarUrl, // Keep existing avatar_url from the contract data
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
