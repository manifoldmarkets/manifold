import { Col } from 'web/components/layout/col'
import Masonry from 'react-masonry-css'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { SimpleContractRow } from 'web/components/simple-contract-row'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { NewsArticleOriginal } from 'web/components/news-article-original'
import { Container } from 'web/components/widgets/container'
import Link from 'next/link'

export const UkraineWarData = () => {
  const contractIds = [
    'TCu9mfpMPGM9i7wjSGWC',
    '8dD3vNDbHnPCx3movLl9',
    'Zj5agn5qrD9Qsz4k80EW',
    'mKuKAAsV3OCAEnhPwTCp',
  ]
  const contracts = useContracts(contractIds)
  const newMarketsId = [
    '	0z22nhXeCipEuXho6qa8',
    'T2pUroz3OwKXmOQ4UOUK',
    'g13teSHUN3VDickGKp9G',
    'XeT9d6hwd1AeeXatOsXS',
  ]
  const newMarkets = useContracts(newMarketsId)
  return (
    <Col>
      <NewsGrid>
        <NewsArticleOriginal
          className="mb-4"
          title="Biden warns the threat of Putin using tactical nuclear weapons is ‘real’
"
          urlToImage="https://media-cldnry.s-nbcnews.com/image/upload/t_fit-1240w,f_auto,q_auto:best/rockcms/2023-06/230620-putin-mb-0947-b05644.jpg"
          url="https://www.nbcnews.com/news/world/putin-nuclear-weapons-threat-real-biden-warns-rcna90114"
          description="The president's comments came as Ukraine pressed on with its counteroffensive and just days after the Kremlin began deploying the weapons to Belarus."
          author="NBC News"
          published_time={Date.UTC(2023, 5, 20, 12)}
        />
        <Container
          header="New Markets"
          containerContent={
            <>
              {contracts &&
                newMarkets.length > 0 &&
                newMarkets.map((contract) => (
                  <>
                    <SimpleContractRow key={contract.id} contract={contract} />
                  </>
                ))}
            </>
          }
        />
        {contracts &&
          contracts.length > 0 &&
          contracts.map((contract) => (
            <>
              <FeedContractCard
                key={contract.id}
                contract={contract}
                className="mb-4"
              />
            </>
          ))}
      </NewsGrid>
    </Col>
  )
}

export const RedditBlackoutData = () => {
  const contractIds = [
    'FsdPt9ZNM8bhJCH6poED',
    '3EK7ViWbBSj6mNKi2ZzV',
    '7XgZSWhWFtSV0SxLUn0P',
  ]
  const contracts = useContracts(contractIds)
  return (
    <Col>
      <NewsGrid>
        <Container
          header="Summary"
          containerContent={
            <ul className="ml-6 list-disc">
              <li>
                Communities boycott Reddit in protest of API pricing which have
                destroyed third party apps.
              </li>
              <li>At peak, 8829 subreddits went dark.</li>
              <li>
                <Link
                  className="break-anywhere decoration-primary-400 underline hover:decoration-2"
                  href="https://reddark.untone.uk/"
                >
                  Only 3243 remain private/restricted.
                </Link>
              </li>
              <li>
                <Link
                  className="break-anywhere decoration-primary-400 underline hover:decoration-2"
                  href="https://www.reddit.com/r/apple/comments/14al426/rapple_blackout_what_happened/"
                >
                  Mods from numerous subreddits have been forced to give in to
                  Reddit's threats.
                </Link>
              </li>
            </ul>
          }
        />
        <NewsArticleOriginal
          className="mb-4"
          title="Thousands of Reddit Communities Stay Dark as App Policy Protest Continues"
          urlToImage="https://static01.nyt.com/images/2023/06/21/multimedia/20xp-reddit1-print-lcjh/20xp-reddit1-lcjh-superJumbo.jpg?quality=75&auto=webp"
          url="https://www.nytimes.com/2023/06/20/business/media/reddit-moderators-api-protest.html"
          description="Users’ anger continued to bubble over changes to the company’s business model."
          author="The New York Times"
          published_time={Date.UTC(2023, 5, 20)}
        />
        {contracts &&
          contracts.length > 0 &&
          contracts.map((contract) => (
            <>
              <FeedContractCard
                key={contract.id}
                contract={contract}
                className="mb-4"
              />
            </>
          ))}
      </NewsGrid>
    </Col>
  )
}

export const MissingSubData = () => {
  const contractIds = [
    'QLdcYfes6w4VSddzc5Lc',
    'dRjGomQYlRMDBaBskqOk',

    'lWojxiYMjgmOZOMVVvJu',
    'YX9ZjC9te9W7dX3vp4o9',
  ]
  const contracts = useContracts(contractIds)

  return (
    <Col>
      <NewsGrid>
        <Container
          header="Summary"
          containerContent={
            <ul className="ml-6 list-disc">
              <li>Contact lost on Sunday, 1h 45m after submerging.</li>
              <li>
                <Link
                  className="break-anywhere decoration-primary-400 underline hover:decoration-2"
                  href="https://youtu.be/Uz7lxiEOouk?t=43"
                >
                  Oxygen runs out Thursday afternoon ET.
                </Link>
              </li>
              <li>
                No GPS, relies on surface support vessel to guide it via text.
              </li>
              <li>
                <Link
                  className="break-anywhere decoration-primary-400 underline hover:decoration-2"
                  href="https://www.vice.com/en/article/bvjjqq/why-did-the-missing-titanic-sub-use-a-dollar40-video-game-controller"
                >
                  Controlled by the 5 passengers using a modified logitech
                  controller
                </Link>
              </li>
              <li>No way to open from the inside - bolted externally.</li>
            </ul>
          }
        />

        <NewsArticleOriginal
          className="mb-4"
          title="Search for Missing Titanic Submersible"
          urlToImage="https://i.ytimg.com/vi/l9_qNO37oFs/maxresdefault.jpg"
          url="https://www.bbc.co.uk/news/live/world-us-canada-65953941"
          description="LIVE: Missing Titanic sub has 40 hours of air left - US Coast Guard"
          author="Edited by Nathan Williams"
        />

        {contracts &&
          contracts.length > 0 &&
          contracts.map((contract) => (
            <>
              <FeedContractCard
                key={contract.id}
                contract={contract}
                className="mb-4"
              />
            </>
          ))}
      </NewsGrid>
    </Col>
  )
}

export const UsElectionsData = () => {
  const contractIds = [
    'XNVdtrFIbQvcNhGXueGl',
    'YTIuuSsNRn2OlA4KykRM',
    '4amdGgZFKTxUMC3Fym6F',
    'ixDhLuu8EJmC4OQQwRyq',
  ]
  const contracts = useContracts(contractIds)
  const newMarketsId = [
    '4MLChi9mLtUA4ecz5tB0',
    'vaPsnIxe8FdWJud7DzDq',
    'IiYcDyn7FM0BwggQZ88f',
    'gLvEHniAUT18ccV6lIhj',
  ]
  const newMarkets = useContracts(newMarketsId)
  return (
    <Col>
      <NewsGrid>
        <NewsArticleOriginal
          className="mb-4"
          title="Judge set Mar-a-lago classified paper trial date for August 14th"
          urlToImage="https://static.independent.co.uk/2023/06/15/23/Trump_Classified_Documents_14918.jpg?quality=75&width=990&crop=4%3A3%2Csmart&auto=webp"
          url="https://www.independent.co.uk/news/world/americas/us-politics/trump-interview-fox-news-bret-baier-latest-b2360589.html"
          description="Former allies pile criticism on Donald Trump over Mar-a-Lago classified documents indictment ahead of 2024 election"
          author="Independent"
        />
        <Container
          header="New Markets"
          containerContent={
            <>
              {contracts &&
                newMarkets.length > 0 &&
                newMarkets.map((contract) => (
                  <>
                    <SimpleContractRow key={contract.id} contract={contract} />
                  </>
                ))}
            </>
          }
        />
        {contracts &&
          contracts.length > 0 &&
          contracts.map((contract) => (
            <>
              <FeedContractCard
                key={contract.id}
                contract={contract}
                className="mb-4"
              />
            </>
          ))}
      </NewsGrid>
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
