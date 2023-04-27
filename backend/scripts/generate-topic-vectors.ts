import { runScript } from 'run-script'
import { ALL_TOPICS } from 'common/topics'
import { generateEmbeddings } from 'shared/helpers/openai-utils'

const TOPICS_TO_IGNORE_FOR_BLANK_TOPIC = [
  'stock',
  'planecrash',
  'permanent',
  'proofnik',
  'personal',
  'destiny.gg',
]

const TOPICS_TO_WORDS: { [key: string]: string } = {
  'LGBTQIA+': 'lesbian, bisexual, gay, transgender',
  'Effective Altruism':
    'effective altruism, charity, donations, altruism, philanthropy, AI safety, existential risk, existential threats',
  AI: 'artificial intelligence, AI, machine learning, deep learning, neural networks',
  Science: 'science, physics, chemistry, biology, neuroscience, psychology',
  Religion: 'religion, christianity, islam, judaism, buddhism, hinduism',
  Education:
    'education, school, college, university, student, teacher, professor',
  // TODO: add more
}
const all_topics = ALL_TOPICS.concat(TOPICS_TO_IGNORE_FOR_BLANK_TOPIC)

if (require.main === module) {
  runScript(async ({ pg }) => {
    for (const topic of all_topics) {
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
