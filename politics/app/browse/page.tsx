import type { Metadata } from 'next'
import { getGroupBySlug } from 'web/lib/supabase/groups'
import { PoliticsPage } from 'politics/components/politics-page'
import clsx from 'clsx'
import { SupabaseSearch } from 'web/components/supabase-search'
import { Col } from 'web/components/layout/col'

type Props = {
  // aka queryparams
  searchParams: { [key: string]: string | string[] | undefined }
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  console.log('searchParams', searchParams)
  const { topic } = searchParams
  if (!topic)
    return {
      title: 'Manifold politics',
      description: 'Browse politics questions on Manifold',
    }
  // fetch data
  const group = await getGroupBySlug(topic as string)
  if (!group) return { title: 'Not found' }

  return {
    title: group.name,
    description: `Browse questions about ${group.name} on Manifold`,
  }
}

export default function Page() {
  return (
    <PoliticsPage trackPageView={'browse page'}>
      <Col className={clsx('relative col-span-10 w-full ')}>
        <SupabaseSearch
          hideSearchTypes={true}
          persistPrefix="search"
          // autoFocus={autoFocus}
          additionalFilter={{
            isPolitics: true,
          }}
          useUrlParams
          isWholePage
          headerClassName={'pt-0 px-2'}
        />
      </Col>
    </PoliticsPage>
  )
}
