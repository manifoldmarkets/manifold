import type { Metadata } from 'next'
import { getGroupBySlug } from 'web/lib/supabase/groups'
import { PoliticsPage } from 'politics/components/politics-page'

type Props = {
  // aka queryparams
  searchParams: { [key: string]: string | string[] | undefined }
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  console.log('searchParams', searchParams)
  // fetch data
  const group = await getGroupBySlug(searchParams.topic as string)
  if (!group) return { title: 'Not found' }

  return {
    title: group.name,
    description: `Browse questions about ${group.name} on Manifold`,
  }
}

export default function Page({ searchParams }: Props) {
  return (
    <PoliticsPage trackPageView={'browse page'}>
      <h1>{searchParams.topic}</h1>
    </PoliticsPage>
  )
}
