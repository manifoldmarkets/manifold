import React from 'react'
import { Col } from 'web/components/layout/col'
import Masonry from 'react-masonry-css'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { ContractCard } from 'web/components/contract/contract-card'
import { SimpleContractRow } from 'web/components/simple-contract-row'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { NewsArticle } from 'web/components/news-article'

export const UkraineWarData = () => {
  const contractIds = ['BKr7KGDSkT6U3dGlqxIk', 'dAfq7vKl4UKbro4uYCep']
  const contracts = useContracts(contractIds)
  return (
    <Col>
      <NewsGrid>
        <NewsArticle
          className="mb-4"
          title="Putin claims Ukraine counter-offensive is failing"
          urlToImage="https://ichef.bbci.co.uk/news/976/cpsprodpb/56DE/production/_130083222_gettyimages-1258663333.jpg.webp"
          url="https://www.bbc.co.uk/news/world-europe-65899424"
          description="This is a hardcoded news embed"
          author="Laura Gozzi"
          published_time={1200}
        />
        {contracts &&
          contracts.length > 0 &&
          contracts.map((contract) => (
            <>
              <ContractCard
                key={contract.id}
                contract={contract}
                className="mb-4"
              />

              <FeedContractCard
                key={contract.id}
                contract={contract}
                className="mb-4"
              />
            </>
          ))}
        <Col className="mb-4">
          {contracts &&
            contracts.length > 0 &&
            contracts.map((contract) => (
              <>
                <SimpleContractRow key={contract.id} contract={contract} />
              </>
            ))}
        </Col>
      </NewsGrid>
      <div>hehe</div>
      <p>aalots of markets about you :3</p>
    </Col>
  )
}

export const RedditBlackoutData = () => {
  const contractIds = ['BKr7KGDSkT6U3dGlqxIk', 'dAfq7vKl4UKbro4uYCep']
  const contracts = useContracts(contractIds)
  return (
    <Col>
      <NewsGrid>
        <NewsArticle
          className="mb-4"
          title="BYYEEEEE REDDIT"
          urlToImage="https://e3.365dm.com/23/06/1600x900/skynews-reddit-blackout_6182344.jpg?20230609091736"
          url="https://www.bbc.co.uk/news/world-europe-65899424"
          description="This is a hardcoded news embed"
          author="Laura Gozzi"
          published_time={1200}
        />
        {contracts && contracts.length > 0 && (
          <ContractCard
            key={'BKr7KGDSkT6U3dGlqxIk'}
            contract={contracts[0]}
            className="mb-4"
          />
        )}

        <Col className="mb-4">
          {contracts &&
            contracts.length > 0 &&
            contracts.map((contract) => (
              <>
                <SimpleContractRow key={contract.id} contract={contract} />
              </>
            ))}
        </Col>
      </NewsGrid>
      <div>hehe</div>
      <p>aalots of markets about you :3</p>
    </Col>
  )
}

const NewsGrid = (props: { children: React.ReactNode }) => (
  <Masonry
    breakpointCols={{ default: 2, 768: 1 }}
    className="-ml-4 flex w-auto"
    columnClassName="pl-4 bg-clip-padding"
  >
    {props.children}
  </Masonry>
)
