import { removeUndefinedProps } from 'common/util/object'
import { buildOgUrl } from 'common/util/og'
import { OgTopic } from 'web/components/og/og-topic'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import { type Group } from 'common/group'
import { api } from 'web/lib/api/api'
// should match topic page's getStaticProps.
export async function getStaticProps(ctx: { params: { topicSlug: string } }) {
  const { topicSlug } = ctx.params
  const topic = await getGroupFromSlug(topicSlug)

  if (!topic) {
    return { notFound: true }
  }

  const topQuestions = await api('search-markets', {
    sort: 'score',
    topicSlug,
    limit: 3,
  })

  return {
    props: {
      topic: removeUndefinedProps(topic),
      topQuestions: topQuestions.map((m) => m.question),
    },
    revalidate: 60,
  }
}

export default function OGTestPage(props: {
  topic: Group
  topQuestions: string[]
}) {
  const { topic, topQuestions } = props
  const ogCardProps = removeUndefinedProps({
    id: topic.id,
    name: topic.name,
    totalMembers: topic.totalMembers.toString(),
    topQuestions: topQuestions.join(','),
  })

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      <div className="text-ink-900 mb-2 mt-6 text-xl">social preview image</div>
      <img
        src={buildOgUrl(ogCardProps, 'topic', 'http://localhost:3000')}
        height={315}
        width={600}
        alt=""
      />

      <div className="text-ink-900 mb-2 mt-6 text-xl">
        og card component (try inspecting)
      </div>
      <div className="h-[315px] w-[600px] resize overflow-hidden">
        <OgTopic {...ogCardProps} topQuestions={topQuestions.join(',')} />
      </div>
    </div>
  )
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
