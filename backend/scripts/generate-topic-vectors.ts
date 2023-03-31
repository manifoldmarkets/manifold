import { runScript } from 'run-script'
import { ALL_TOPICS } from 'common/topics'
import { generateEmbeddings } from 'shared/helpers/openai-utils'

if (require.main === module) {
  runScript(async ({ pg }) => {
    for (const topic of ALL_TOPICS) {
      console.log('Topic', topic)
      const embedding = await generateEmbeddings(topic)
      if (!embedding || embedding.length < 1500) {
        console.log('No embeddings for', topic)
        continue
      }

      console.log('Generated embeddings')

      await pg
        .none(
          'insert into topic_embeddings (topic, embedding) values ($1, $2) on conflict (topic) do nothing',
          [topic, embedding]
        )
        .catch((err) => console.error(err))
    }
  })
}
