import { useEffect, useState } from 'react'
import Masonry from 'react-masonry-css'

import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { db } from 'web/lib/supabase/db'
import { NewsArticle } from 'web/components/news-article'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useTracking } from 'web/hooks/use-tracking'
import { SEO } from 'web/components/SEO'
import { Contract } from 'common/contract'
import { SimpleContractRow } from 'web/components/simple-contract-row'
import { NewsTopicsTabs } from 'web/components/news-topics-tabs'

export default function NewsPage() {
  useTracking('view news page')
  const { articles, contracts } = useNews()

  const content =
    contracts.length === 0 ? (
      <LoadingIndicator />
    ) : (
      <Masonry
        breakpointCols={{ default: 2, 768: 1 }}
        className="-ml-4 flex w-auto"
        columnClassName="pl-4 bg-clip-padding"
      >
        {articles.map((article) => (
          <Col
            className="bg-canvas-0 border-canvas-50 hover:border-canvas-100 mb-8 rounded-lg border"
            key={'article' + article.id}
          >
            <NewsArticle urlToImage={article.image_url} {...article} />

            {article.contract_ids
              .map((cid: any) => contracts.find((c) => c.id === cid))
              .filter((c: any) => !!c)
              .slice(0, 3)
              .map((contract: Contract) => (
                <SimpleContractRow contract={contract} key={contract.id} />
              ))}
          </Col>
        ))}
      </Masonry>
    )

  return (
    <Page>
      <SEO
        title="News"
        description="Breaking news meets the wisdom of the market"
      />
      <Col className="mx-auto w-full gap-6 pb-8 sm:px-2 lg:pr-4">
        <Row className="mx-4 mt-2 items-center justify-between gap-4">
          <Title className="!mb-0">News</Title>
        </Row>

        <NewsTopicsTabs articlesContent={content} />
      </Col>
    </Page>
  )
}

const useNews = () => {
  const [articles, setArticles] = useState<any[]>([])
  const user = useUser()

  useEffect(() => {
    if (user === undefined) return

    db.rpc('user_top_news' as any, {
      uid: user?.id || 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2',
      similarity: user?.id ? 0.82 : 0,
      n: 50,
    }).then(({ data }) => setArticles(data ?? []))
  }, [user])

  const contractIds = articles.flatMap((c) => c.contract_ids.slice(0, 3))
  const contracts = useContracts(contractIds).filter(
    (c) => c?.resolution !== 'CANCEL'
  )

  return { articles, contracts }
}
