import { createSupabaseDirectClient, pgp } from 'shared/supabase/init'
import { runScript } from './run-script'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { getContractFromSlugSupabase, getUser } from 'shared/utils'

interface Args {
  slugs: string[]
  toUserId: string
}

const argv = yargs(hideBin(process.argv))
  .option('slugs', {
    alias: 's',
    type: 'array',
    description: 'List of slugs to transfer',
    demandOption: true,
    coerce: (arg) => {
      return Array.isArray(arg) ? arg : arg.split(',')
    },
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
  runScript(async ({ pg }) => {
    const { slugs: slugsToTransfer, toUserId } = argv

    try {
      const toUser = await getUser(toUserId, pg)

      if (!toUser) {
        console.error('User not found')
        return
      }

      const contractsToTransfer = (
        await Promise.all(
          slugsToTransfer.map((slug) => getContractFromSlugSupabase(slug))
        )
      ).filter((contract) => contract !== null)

      if (contractsToTransfer.length === 0) {
        console.error('No contracts found')
        return
      }

      if (contractsToTransfer.length !== slugsToTransfer.length) {
        console.error(
          'Some contracts could not be found. Please check the slugs.'
        )
        return
      }

      console.log(
        `Transferring ${contractsToTransfer.length} contracts to ${toUser.name}`
      )

      for (let i = 0; i < contractsToTransfer.length; i += BATCH_SIZE) {
        const batch = contractsToTransfer.slice(i, i + BATCH_SIZE)

        for (const contract of batch) {
          const { id } = contract!

          await pg.none(
            `UPDATE contracts 
             SET creator_id = $1, 
                 data = jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         data, 
                         '{creatorId}', 
                         to_jsonb($1::text), 
                         true
                       ), 
                       '{creatorUsername}', 
                       to_jsonb($2::text), 
                       true
                     ), 
                     '{creatorName}', 
                     to_jsonb($3::text), 
                     true
                   ),
                   '{creatorAvatarUrl}',
                   to_jsonb($4::text),
                   true
                 )
             WHERE id = $5`,
            [toUser.id, toUser.username, toUser.name, toUser.avatarUrl, id]
          )
        }
      }

      console.log('done.')
    } catch (error) {
      console.error('Error transferring contracts:', error)
    }
  })
}
