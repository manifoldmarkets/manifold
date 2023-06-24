import { runScript } from 'run-script'
import { processNews } from 'shared/process-news'

if (require.main === module) {
  runScript(async ({ db, pg }) => {
    const apiKey = process.env.NEWS_API_KEY
    if (!apiKey) {
      throw new Error('Missing NEWS_API_KEY')
    }

    const readOnly = true
    await processNews(apiKey, db, pg, readOnly)
  })
}
