import { runScript } from './run-script'

runScript(async ({ pg }) => {
  const posts = await pg.manyOrNone(
    `SELECT id, data->>'slug' as slug, data->>'title' as title, data->>'creatorId' as creator_id
     FROM old_posts 
     ORDER BY (data->>'createdTime')::bigint DESC 
     LIMIT 5`
  )
  console.log('Recent posts:', posts)
})
