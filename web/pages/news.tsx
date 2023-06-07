import clsx from 'clsx'
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
import { ContractMention } from 'web/components/contract/contract-mention'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useTracking } from 'web/hooks/use-tracking'

export default function NewsPage() {
  useRedirectIfSignedOut()
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
          <Col className="mb-8" key={'article' + article.id}>
            <NewsArticle urlToImage={article.image_url} {...article} />

            {article.contract_ids
              .map((cid: any) => contracts.find((c) => c.id === cid))
              .filter((c: any) => !!c)
              .slice(0, 3)
              .map((contract: any) => (
                <ContractMention
                  contract={contract}
                  key={`news-${article.id}-contract-${contract.id}`}
                  className="my-1 mx-2"
                />
              ))}
          </Col>
        ))}
      </Masonry>
    )

  return (
    <Page>
      <Col className="mx-auto w-full gap-6 pb-8 sm:px-2 lg:pr-4">
        <Row className="mx-4 mb-2 items-center justify-between gap-4">
          <Title children="News" className="!my-0 hidden sm:block" />
        </Row>

        <Col className={clsx('gap-6')}>{content}</Col>
      </Col>
    </Page>
  )
}

const useNews = () => {
  const [articles, setArticles] = useState<any[]>([])
  const user = useUser()

  useEffect(() => {
    db.rpc('user_top_news' as any, {
      uid: user?.id || '',
      similarity: 0.8,
      n: 50,
    }).then(({ data }) => setArticles(data ?? []))
  }, [user?.id])

  const contractIds = articles.flatMap((c) => c.contract_ids.slice(0, 3))
  const contracts = useContracts(contractIds).filter(
    (c) => c?.resolution !== 'CANCEL'
  )

  return { articles, contracts }
}
