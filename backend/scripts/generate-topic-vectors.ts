import { runScript } from 'run-script'
import { ALL_TOPICS } from 'common/topics'
import { generateEmbeddings } from 'shared/helpers/openai-utils'

type topic = typeof ALL_TOPICS[number]
const TOPICS_TO_WORDS: { [key: topic]: string } = {
  'LGBTQIA+': 'lesbian, bisexual, gay, transgender',
  // TODO ian's adding more
}
if (require.main === module) {
  runScript(async ({ pg }) => {
    for (const topic of ALL_TOPICS) {
      console.log('Topic', topic)
      const embeddingsSource = Object.keys(TOPICS_TO_WORDS).includes(topic)
        ? TOPICS_TO_WORDS[topic]
        : topic
      console.log('Embeddings source', embeddingsSource)
      const embedding = await generateEmbeddings(embeddingsSource)
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
