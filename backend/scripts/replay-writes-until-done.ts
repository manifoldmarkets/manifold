import { getReplicatorUrl } from 'common/api'
import { log } from 'shared/utils'

const main = async () => {
  let n = 1
  while (n > 0) {
    const url = getReplicatorUrl() + '/replay-failed'
    log('Calling replay failed endpoint', url)
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }).catch((e) => {
      console.error(e)
      return null
    })
    if (!res) break
    const body = await res.json()
    console.log('response', body)
    n = body.n
  }
  process.exit()
}
if (require.main === module) {
  main()
}
