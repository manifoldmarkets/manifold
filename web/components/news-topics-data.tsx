import Masonry from 'react-masonry-css'

import { Col } from 'web/components/layout/col'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { SimpleContractRow } from 'web/components/simple-contract-row'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { NewsArticleOriginal } from 'web/components/news-article-original'
import { NewsTopicsContentContainer } from 'web/components/widgets/news-topics-content-container'
import Link from 'next/link'
import { Title } from 'web/components/widgets/title'

export const ElonVersusZuckData = () => {
  const [fightMarket, winMarket, streamMarket, julyMarket] = useContracts([
    'hqTneuDcF7jXJt4tEHlj',
    'RqQdSlfdP7Vf6QmsJ80R',
    'ntTT053ZYy5uWgEtQ9wt',
    'EsCfODH8S0FC1lfvwYXa',
  ])

  return (
    <Col>
      <Title className="mb-4">Elon vs Zuck</Title>
      <NewsGrid>
        <NewsArticleOriginal
          title="Elon Musk and Mark Zuckerberg agree to hold cage fight"
          urlToImage="https://ichef.bbci.co.uk/news/976/cpsprodpb/AEC1/production/_130173744_fight-index-getty.jpg.webp"
          url="https://www.bbc.com/news/business-65981876"
          description="Two of the world's most high-profile technology billionaires - Elon Musk and Mark Zuckerberg - have agreed to fight each other in a cage match."
          author="Peter Hoskins"
          published_time={Date.UTC(2023, 5, 22, 12)}
          className="mb-4"
        />

        {fightMarket && (
          <FeedContractCard
            key={fightMarket.id}
            contract={fightMarket}
            className="mb-4"
          />
        )}

        {winMarket && (
          <FeedContractCard
            key={winMarket.id}
            contract={winMarket}
            className="mb-4"
          />
        )}

        <NewsArticleOriginal
          title="Elon Musk vs. Mark Zuckerberg? Dana White prepared to make 'biggest fight ever in the history of the world'"
          urlToImage="https://img-s-msn-com.akamaized.net/tenant/amp/entityid/AA1cUcfI.img?w=768&h=511&m=6&x=144&y=83&s=693&d=254"
          url="https://www.msn.com/en-us/sports/other/elon-musk-vs-mark-zuckerberg-dana-white-prepared-to-make-biggest-fight-ever-in-the-history-of-the-world/ar-AA1cTY8R"
          description="According to UFC president Dana White, “both guys are absolutely dead serious.”"
          author="Simon Samano"
          published_time={Date.UTC(2023, 5, 23, 0)}
          className="mb-4"
        />

        <img
          src="https://media.discordapp.net/attachments/1100471650392223834/1121601859073871943/image0.jpg?width=862&height=686"
          width={862}
          height={686}
          alt=""
          className="mb-4"
        />

        {streamMarket && (
          <FeedContractCard
            key={streamMarket.id}
            contract={streamMarket}
            className="mb-4"
          />
        )}

        {julyMarket && (
          <FeedContractCard
            key={julyMarket.id}
            contract={julyMarket}
            className="mb-4"
          />
        )}
      </NewsGrid>
    </Col>
  )
}

export const RussianCoupData = () => {
  const prigozhinMarkets = useContracts([
    'Uj4VpjfgWxdwwek3b9UJ',
    '3hoy92xFKV9SQbX1HTiy',
    'u25Sl9uaATsilhkCr7uU',
    'p8OWIPghkXM04YJy5AvQ',
    'jCbA8TDVrS6UXyVMyYga',
    'gVyhRWDR9BfptUl43Mdd',
    'Om1ehAOGUjDqmjTZtC2y',
    '3Eyye13TvWvY0IdoPcI3',
  ])
  return (
    <Col>
      <Title className="mb-4">Russian Merc Chief Prigozhin Speaks Out</Title>
      <NewsGrid>
        <NewsArticleOriginal
          className="mb-4"
          title="Wagner boss Prigozhin says Russia's 'evil' defense ministry 'must be stopped' in latest shocking provocation"
          urlToImage="https://i.insider.com/6495e7aa65b9ce0018a49df7?width=1300&format=jpeg&auto=webp"
          url="https://www.businessinsider.com/wagner-boss-prigozhin-russia-evil-defense-ministry-must-stop-2023-6"
          description={`Wagner Group founder Yevgeny Prigozhin blasted Russia's defense ministry as "evil" on Friday, saying Moscow's military leadership "must be stopped" after an alleged missile strike killed scores of his fighters, allegations immediately denied by that Russia's ministry of defense.`}
          author="Jake Epstein"
          published_time={Date.UTC(2023, 5, 23, 19)}
        />

        <NewsArticleOriginal
          className="mb-4"
          title="Russia accuses Wagner mercenary boss Yevgeny Prigozhin of mutiny after he says Moscow killed 2,000 of his men"
          urlToImage="https://live-production.wcms.abc-cdn.net.au/0b572035d75fec649729bcc01e15ad56?impolicy=wcms_crop_resize&cropH=2811&cropW=4997&xPos=3&yPos=0&width=862&height=485"
          url="https://www.abc.net.au/news/2023-06-24/fsb-opens-criminal-case-against-wagner-chief-prigozhin-mutiny/102519616"
          description={`Russia has accused mercenary chief Yevgeny Prigozhin of calling for an armed mutiny after he alleged, without providing evidence, that the military leadership had killed 2,000 of his fighters and vowed to stop what he called its "evil".`}
          author="Reuters"
          published_time={Date.UTC(2023, 5, 23, 22)}
        />

        {prigozhinMarkets.map((contract) => (
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

export const UkraineWarData = () => {
  const contractIds = [
    'TCu9mfpMPGM9i7wjSGWC',
    '8dD3vNDbHnPCx3movLl9',
    'Zj5agn5qrD9Qsz4k80EW',
    'mKuKAAsV3OCAEnhPwTCp',
    'Zn6S6CWvmLJmOGSkFNEh',
  ]
  const contracts = useContracts(contractIds)
  const newMarketsId = [
    '	0z22nhXeCipEuXho6qa8',
    'T2pUroz3OwKXmOQ4UOUK',
    'g13teSHUN3VDickGKp9G',
    'XeT9d6hwd1AeeXatOsXS',
  ]
  const newMarkets = useContracts(newMarketsId)

  const prigozhinMarkets = useContracts([
    'Uj4VpjfgWxdwwek3b9UJ',
    '3hoy92xFKV9SQbX1HTiy',
  ])
  return (
    <Col>
      <Title className="mb-4">Ukraine vs Russia</Title>
      <NewsGrid>
        <NewsArticleOriginal
          className="mb-4"
          title="Wagner boss Prigozhin says Russia's 'evil' defense ministry 'must be stopped' in latest shocking provocation"
          urlToImage="https://i.insider.com/6495e7aa65b9ce0018a49df7?width=1300&format=jpeg&auto=webp"
          url="https://www.businessinsider.com/wagner-boss-prigozhin-russia-evil-defense-ministry-must-stop-2023-6"
          description={`Wagner Group founder Yevgeny Prigozhin blasted Russia's defense ministry as "evil" on Friday, saying Moscow's military leadership "must be stopped" after an alleged missile strike killed scores of his fighters, allegations immediately denied by that Russia's ministry of defense.`}
          author="Jake Epstein"
          published_time={Date.UTC(2023, 5, 23, 19)}
        />

        {prigozhinMarkets.map((contract) => (
          <>
            <FeedContractCard
              key={contract.id}
              contract={contract}
              className="mb-4"
            />
          </>
        ))}

        <NewsArticleOriginal
          className="mb-4"
          title="Ukrainian intelligence shows Moscow is plotting 'terror attack' on nuclear plant
"
          urlToImage="https://www.icrc.org/sites/default/files/styles/special_page_image/public/document_new/image/tihange_nuclear_power_station_belgium-reuters.jpg?itok=yUgL6S2U"
          url="https://news.sky.com/story/ukraine-russia-war-latest-counteroffensive-paused-putin-12541713"
          description="The president's comments came as Ukraine pressed on with its counteroffensive and just days after the Kremlin began deploying the weapons to Belarus."
          author="Sky News"
          published_time={Date.UTC(2023, 5, 22, 11)}
        />

        <NewsTopicsContentContainer
          header="New Questions"
          containerContent={
            <>
              {contracts &&
                newMarkets.map((contract) => (
                  <SimpleContractRow key={contract.id} contract={contract} />
                ))}
            </>
          }
        />
        {contracts.map((contract) => (
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
      <Title className="mb-4">Reddit Blackout</Title>
      <NewsGrid>
        <NewsTopicsContentContainer
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
    'Kb8JZ1E7PRK83wQ8Zt9q',
  ]
  const contracts = useContracts(contractIds)

  return (
    <Col>
      <Title className="mb-4">Missing Submarine</Title>
      <NewsGrid>
        <NewsTopicsContentContainer
          header="Summary"
          containerContent={
            <ul className="ml-6 list-disc">
              <li>
                <Link
                  href={'https://www.bbc.co.uk/news/world-us-canada-65991651'}
                  className="break-anywhere decoration-primary-400 underline hover:decoration-2"
                >
                  Breaking - Debris field: Parts of missing sub's cover found,
                  expert says{' '}
                </Link>
              </li>
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
          url="https://www.bbc.co.uk/news/live/world-us-canada-65967464"
          description='David Mearns tells the BBC a "landing frame and a rear cover from the submersible" were seen'
          author="Edited by Frances Mao"
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
    'HXN7yKJLxZyOxKhjB75s',
    'tUwInVx79MKObXLzsrjC',
    '4MLChi9mLtUA4ecz5tB0',
    'vaPsnIxe8FdWJud7DzDq',
  ]
  const newMarkets = useContracts(newMarketsId)
  return (
    <Col>
      <Title className="mb-4">US Elections</Title>
      <NewsGrid>
        <NewsArticleOriginal
          className="mb-4"
          title="Judge set Mar-a-lago classified paper trial date for August 14th"
          urlToImage="https://static.independent.co.uk/2023/06/15/23/Trump_Classified_Documents_14918.jpg?quality=75&width=990&crop=4%3A3%2Csmart&auto=webp"
          url="https://www.independent.co.uk/news/world/americas/us-politics/trump-interview-fox-news-bret-baier-latest-b2360589.html"
          description="Former allies pile criticism on Donald Trump over Mar-a-Lago classified documents indictment ahead of 2024 election"
          author="Independent"
        />
        <NewsTopicsContentContainer
          header="New Questions"
          containerContent={
            <>
              {contracts &&
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
