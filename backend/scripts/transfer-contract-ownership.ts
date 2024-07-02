import { createSupabaseDirectClient, pgp } from 'shared/supabase/init'

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

const supabaseDirectClient = createSupabaseDirectClient()

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

    try {
      const toUserData = await supabaseDirectClient.oneOrNone<User>(
        'SELECT id, username, name, created_time FROM users WHERE id = $1',
        [toUserId]
      )

      if (!toUserData) {
        console.error('User not found')
        return
      }

      const toUser: User = toUserData

      const contractsData = await supabaseDirectClient.any<Contract>(
        'SELECT id, data FROM contracts WHERE slug IN ($1:csv)',
        [slugsToTransfer]
      )

      if (contractsData.length === 0) {
        console.error('No contracts found')
        return
      }

      const contractsToTransfer: Contract[] = contractsData

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

        const upsertQuery =
          pgp.helpers.update(
            updates,
            ['creator_id', 'created_time', 'data'],
            'contracts'
          ) + ' WHERE v.id = t.id'

        await supabaseDirectClient.none(upsertQuery)
      }

      console.log('done.')
    } catch (error) {
      console.error('Error transferring contracts:', error)
    }
  })
}
