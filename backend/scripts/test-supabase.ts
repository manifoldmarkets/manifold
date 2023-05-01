import { runScript } from 'run-script'
import { updateUsersCardViewEmbeddings } from 'shared/helpers/embeddings'
import { addUserToLeague } from 'shared/leagues'

if (require.main === module) {
  runScript(async ({ pg }) => {
    // James prod user id
    // const userId = '5LZ4LgYuySdL1huCWe7bti02ghx2'
    // James dev user id
    // const userId = 'pfKxvtgSEua5DxoIfiPXxR4fAWd2'
    // console.log(await updateCardViewEmbedding(pg, userId))

    // await updateUsersCardViewEmbeddings(pg)
    // console.log('Completed updateUsersCardViewEmbeddings')

    await addUserToLeague(pg, 'abc', 1, 1)
  })
}
