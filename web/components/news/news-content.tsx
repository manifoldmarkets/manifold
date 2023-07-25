import { Col } from 'web/components/layout/col'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { SimpleContractRow } from 'web/components/simple-contract-row'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { DashboardNewsItem } from 'web/components/news/dashboard-news-item'
import { NewsTopicsContentContainer } from 'web/components/widgets/news-topics-content-container'
import Link from 'next/link'
import { Title } from 'web/components/widgets/title'
import { NewsGrid, createNewsDashboardTab } from './news-dashboard'

const SummitNATO = createNewsDashboardTab('NATO Summit', 'NATO Summit', [
  { slug: 'will-ukraine-be-an-official-member' },
  { slug: 'will-ukraine-join-nato-by-2033' },
  {
    url: 'https://www.washingtonpost.com/world/2023/07/11/ukraine-nato-summit-2023-sweden/',
  },
  { url: 'https://www.bbc.com/news/world-europe-66160319' },
  { slug: 'will-sweden-join-nato-before-2024' },
  { slug: 'will-sweden-join-nato-by-the-end-of' },
  { slug: 'international-affairs-2023-turkey-a' },
  {
    url: 'https://www.nbcnews.com/news/world/zelenskyy-nato-ukraine-vilnius-russia-biden-war-membership-rcna93382',
  },
  { slug: 'will-zelenskyy-attend-the-2024-nato' },
  {
    url: 'https://abcnews.go.com/Business/wireStory/ukraine-tops-nato-summit-agenda-defense-plans-swedens-100997906',
  },
  { slug: 'will-nato-deploy-nuclear-weapons-to-6f38766ad8d8' },
  { slug: 'will-nato-deploy-nuclear-weapons-to' },
  { slug: 'any-country-invokes-article-5-of-na' },
  { slug: 'will-kazakhstan-join-nato-by-2033' },
  { slug: 'will-moldova-join-the-eu-by-2025' },
])
const GlobalWarming = createNewsDashboardTab(
  'Record heat',
  'New record for hottest day',
  [
    {
      url: 'https://www.smithsonianmag.com/smart-news/earth-faces-hottest-day-ever-recorded-three-days-in-a-row-180982493/',
    },
    { slug: 'will-2023-be-the-hottest-year-on-re' },

    {
      content: (
        <img
          src="https://cdn.vox-cdn.com/uploads/chorus_asset/file/24771180/heat_waves_download1_2022.png"
          className="mb-4"
        />
      ),
    },
    { slug: 'will-the-record-for-hottest-day-be' },
    { slug: 'will-this-summer-be-the-hottest-rec' },
    { slug: 'will-bryan-caplan-win-his-climate-b' },
    { slug: 'arctic-sea-ice-extent-will-reach-a' },
    { slug: 'will-climate-change-be-successfully ' },
    { slug: 'will-climate-change-be-successfully' },
    { slug: 'will-carbon-removal-be-pivotal-in-m' },
    { slug: 'what-percentage-of-us-energy-will-b' },
    {
      url: 'https://www.vox.com/climate/2023/7/5/23784587/hottest-day-heat-wave-recorded-temperature-climate-change',
    },
  ]
)
const Threads = createNewsDashboardTab('Threads', 'Facebook Launches Threads', [
  {
    url: 'https://about.fb.com/news/2023/07/introducing-threads-new-app-text-sharing/',
  },
  { slug: 'will-threads-have-more-daily-active' },
  { slug: 'will-twitter-have-more-users-than-m' },
  {
    url: 'https://www.bbc.com/news/technology-66112648',
  },
  { slug: 'how-many-users-will-threads-have-af' },
  { slug: 'will-elon-musk-posy-on-instagram-th' },
  { slug: 'will-threads-metas-twitter-alternat' },
  { slug: 'which-twitter-alternative-will-have' },
])

const OpenAI = createNewsDashboardTab(
  'OpenAI',
  'OpenAI announces Superalignment',
  [
    { url: 'https://openai.com/blog/introducing-superalignment' },
    { slug: 'will-superalignment-succeed' },
    { slug: 'will-superalignment-succeed-accordi' },
    { slug: 'will-openais-superalignment-project' },
    { slug: 'will-openai-hint-at-or-claim-to-hav' },
    { slug: 'will-openai-allow-full-access-to-th' },
    { slug: 'will-openai-an-ai-alignment-organiz' },
    { slug: 'will-openai-have-200-million-in-rev' },
    { slug: 'will-openai-anthropic-or-deepmind-s' },
    { slug: 'what-will-be-the-average-pdoom-of-a' },
    { slug: 'will-superposition-in-transformers' },
    {
      url: 'https://www.wired.com/story/google-deepmind-demis-hassabis-chatgpt/',
    },
    { slug: 'will-googles-gemini-beat-gpt4-in-te' },
    { slug: 'will-google-deepmind-and-openai-hav' },
    { slug: 'will-an-ai-get-gold-on-any-internat' },
    { slug: 'will-ai-be-a-major-topic-during-the' },
    // { slug: 'if-artificial-general-intelligence' }, // card looks too ugly
  ]
)

const UkraineWar = createNewsDashboardTab('Ukraine War', 'War in Ukraine', [
  {
    url: 'https://www.bbc.co.uk/news/world-europe-66289136',
  },
  { slug: 'will-ukraine-sever-the-land-bridge-58877ff44c53' },

  { slug: 'will-there-be-a-nuclear-disaster-at' },
  { slug: 'how-will-the-ukrainerussia-border-l' },
  { slug: 'will-any-part-of-the-zaporizhzhia-n' },
  { slug: 'will-russia-nuke-ukraine' },
  { slug: 'will-the-wagner-group-stop-operatin-ad2bc1b87277' },
  { slug: 'will-the-black-sea-grain-deal-be-ex' },
  {
    slug: 'will-vladimir-putin-still-be-the-le',
  },
  { slug: 'will-ukraine-regain-control-over-cr' },
  { slug: 'will-ukraine-sever-the-land-bridge' },
  { slug: 'will-the-ukraine-war-be-over-by-the' },
  { slug: '5-will-there-be-a-lasting-ceasefire' },
  { slug: 'will-china-convene-and-mediate-peac' },
  { slug: 'will-sergei-shoigu-still-be-the-rus' },
])

const WestBank = createNewsDashboardTab(
  'West Bank',
  'Israeli millitary operation in West Bank',
  [
    {
      url: 'https://www.cnn.com/2023/07/02/middleeast/israel-jenin-camp-idf-raid-west-bank-intl-hnk/index.html',
    },
    { slug: 'will-more-than-500-palestinians-be' },
    { slug: 'will-israel-seize-and-occupy-any-ne' },
    {
      url: 'https://www.timesofisrael.com/liveblog_entry/idf-west-bank-commander-jenin-raid-is-not-a-one-off-operation/',
    },
    { slug: 'will-the-3rd-intifada-begin-in-2023' },
    { slug: 'will-israel-withdraw-from-the-west' },
    { slug: 'will-israel-annex-any-part-of-the-w' },
  ]
)
const FrenchRiots = createNewsDashboardTab(
  'French Riots',
  'Rioting across France after police shooting',
  [
    {
      url: 'https://www.npr.org/2023/06/30/1185394143/france-teen-police-shooting-protests-nahel',
    },

    { slug: 'in-the-french-riots-will-a-french-p' },
    { slug: 'will-the-cop-who-shot-nahel-m-be-fo' },
    { slug: 'will-there-be-any-protests-or-riots' },
    {
      url: 'https://www.huffpost.com/entry/france-police-shooting-rioting_n_64a1b0b2e4b028e647318565',
    },
    { slug: 'will-macron-dissolve-the-assemblee' },
    { slug: 'will-emmanuel-macron-cease-being-pr' },
    { slug: 'will-the-next-president-of-france-b' },
    { slug: 'will-the-a-stage-2023-tour-de-franc' },
    { slug: 'when-will-frances-tourism-levels-re' },
  ]
)
const SupremeCourt = createNewsDashboardTab(
  'Supreme Court',
  'Affirmative Action Ruling & More',
  [
    {
      url: 'https://edition.cnn.com/politics/live-news/supreme-court-decisions',
    },
    { slug: 'will-harvard-lose-the-supreme-court' },
    { slug: 'will-harvard-admit-a-class-that-is-71b4a35bf252' },
    { slug: 'will-harvard-admit-a-class-of-more' },
    { slug: 'will-any-top-10-university-admit-si' },
    {
      url: 'https://edition.cnn.com/2023/06/26/politics/supreme-court-final-week-preview/index.html',
    },
    { slug: 'will-the-supreme-court-permit-biden' },
    { slug: 'will-student-loan-payments-resume-b-738383e534d9' },
    { slug: 'will-the-us-supreme-court-rule-in-f' },
    { slug: 'in-counterman-v-colorado-will-the-s' },
    { slug: 'in-the-teamsters-scotus-case-will-t' },
    { slug: 'will-scotus-decide-that-a-selfappoi' },
  ]
)

const ElonVersusZuck = createNewsDashboardTab(
  'Elon vs Zuck',
  'Elon Musk and Mark Zuckerberg cage fight?',
  [
    { slug: 'will-elon-musk-and-mark-zuckerberg-bd28b2349d95' },
    { url: 'https://www.bbc.com/news/business-65981876' },
    { slug: 'if-elon-zuck-fight-will-it-be-at-th' },
    {
      url: 'https://nypost.com/2023/06/30/elon-musk-mark-zuckerberg-can-fight-at-colosseum-italian-govt/',
    },
    { slug: 'when-will-the-zuckerberg-vs-musk-fi' },
    { slug: 'conditional-in-the-fight-between-mu' },
    { slug: 'if-elon-zuck-fight-will-either-brea' },
    { slug: 'if-the-elon-musk-vs-zuckerberg-figh-92350f63685f' },
    {
      content: (
        <img
          src="https://media.discordapp.net/attachments/1100471650392223834/1121601859073871943/image0.jpg?width=862&height=686"
          width={862}
          height={686}
          alt=""
          className="mb-4"
        />
      ),
    },
  ]
)

const RussianCoupData = () => {
  const key = 'russian-coup'
  const prigozhinMarkets = useContracts([
    'HZKHs5sbICIRrtBeGXMu',
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
      <Title className="mb-4">Coup Over? Russian Merc Chief Stands Down</Title>
      <NewsGrid>
        <DashboardNewsItem
          className="mb-4"
          title="Vladimir Putin says Wagner mutiny leaders will be 'brought to justice'"
          urlToImage="https://ichef.bbci.co.uk/news/976/cpsprodpb/B235/production/_130212654_vladimirputin.png.webp"
          url="https://www.bbc.com/news/world-europe-66024526"
          description={`Russian President Vladimir Putin has accused the leaders of last weekend's Wagner mutiny of wanting "to see Russia choked in bloody strife".`}
          author="James Gregory & Sarah Rainsford"
          published_time={Date.UTC(2023, 5, 26, 23, 30)}
        />

        <DashboardNewsItem
          className="mb-4"
          title="Rumors grow that a top Russian general who knew of Prigozhin's attempted coup may be under arrest"
          urlToImage="https://s.yimg.com/ny/api/res/1.2/oXNcLmKnIjZRMTErBYsp9A--/YXBwaWQ9aGlnaGxhbmRlcjt3PTcwNTtoPTQ3MDtjZj13ZWJw/https://media.zenfs.com/en/business_insider_articles_888/ce08d4cc8e92c221186763d12243e885"
          url="https://www.yahoo.com/news/rumors-grow-top-russian-general-213316102.html"
          description={`Gen. Surovikin knew Prigozhin was planning an uprising against Russian military leadership, NYT reported.`}
          author="Chris Panella"
          published_time={Date.UTC(2023, 5, 28, 9, 30)}
        />

        {prigozhinMarkets.map((contract) => (
          <>
            <FeedContractCard
              key={key + contract.id}
              contract={contract}
              className="mb-4"
            />
          </>
        ))}

        <DashboardNewsItem
          className="mb-4"
          title="Wagner chief says he ordered his Russian mercenaries to halt march on Moscow and return to Ukraine"
          urlToImage="https://storage.googleapis.com/afs-prod/media/d4ed1506982c42e998398220ee61d51a/1000.jpeg"
          url="https://apnews.com/article/russia-ukraine-wagner-prigozhin-9acbdf1eda849692ca0423a4116058d1"
          description={`A rebellious mercenary commander said Saturday he ordered his mercenaries to halt their march on Moscow and retreat to field camps in Ukraine, appearing to defuse a dramatically escalating crisis that represented the most significant challenge to President Vladimir Putin in his more than two decades in power.`}
          author="AP News"
          published_time={Date.UTC(2023, 5, 24, 18)}
        />

        <DashboardNewsItem
          className="mb-4"
          title="Russia accuses Wagner mercenary boss Yevgeny Prigozhin of mutiny after he says Moscow killed 2,000 of his men"
          urlToImage="https://live-production.wcms.abc-cdn.net.au/0b572035d75fec649729bcc01e15ad56?impolicy=wcms_crop_resize&cropH=2811&cropW=4997&xPos=3&yPos=0&width=862&height=485"
          url="https://www.abc.net.au/news/2023-06-24/fsb-opens-criminal-case-against-wagner-chief-prigozhin-mutiny/102519616"
          description={`Russia has accused mercenary chief Yevgeny Prigozhin of calling for an armed mutiny after he alleged, without providing evidence, that the military leadership had killed 2,000 of his fighters and vowed to stop what he called its "evil".`}
          author="Reuters"
          published_time={Date.UTC(2023, 5, 23, 22)}
        />

        <DashboardNewsItem
          className="mb-4"
          title="Wagner boss Prigozhin says Russia's 'evil' defense ministry 'must be stopped' in latest shocking provocation"
          urlToImage="https://i.insider.com/6495e7aa65b9ce0018a49df7?width=1300&format=jpeg&auto=webp"
          url="https://www.businessinsider.com/wagner-boss-prigozhin-russia-evil-defense-ministry-must-stop-2023-6"
          description={`Wagner Group founder Yevgeny Prigozhin blasted Russia's defense ministry as "evil" on Friday, saying Moscow's military leadership "must be stopped" after an alleged missile strike killed scores of his fighters, allegations immediately denied by that Russia's ministry of defense.`}
          author="Jake Epstein"
          published_time={Date.UTC(2023, 5, 23, 19)}
        />
      </NewsGrid>
    </Col>
  )
}

const UkraineWarData = () => {
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
        <DashboardNewsItem
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

        <DashboardNewsItem
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

const RedditBlackoutData = () => {
  const key = 'reddit-blackout'
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
        <DashboardNewsItem
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
                key={key + contract.id}
                contract={contract}
                className="mb-4"
              />
            </>
          ))}
      </NewsGrid>
    </Col>
  )
}

const MissingSubData = () => {
  const key = 'missing-sub'
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
        <iframe
          className="mb-4 h-48 w-full"
          src="https://www.youtube.com/embed/0aybrUe8cPY"
          title="YouTube video player"
          allow=""
        ></iframe>

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

        {contracts &&
          contracts.length > 0 &&
          contracts.map((contract) => (
            <>
              <FeedContractCard
                key={key + contract.id}
                contract={contract}
                className="mb-4"
              />
            </>
          ))}

        <DashboardNewsItem
          className="mb-4"
          title="Search for Missing Titanic Submersible"
          urlToImage="https://i.ytimg.com/vi/l9_qNO37oFs/maxresdefault.jpg"
          url="https://www.bbc.co.uk/news/live/world-us-canada-65967464"
          description='David Mearns tells the BBC a "landing frame and a rear cover from the submersible" were seen'
          author="Edited by Frances Mao"
        />
      </NewsGrid>
    </Col>
  )
}

const Election2024 = createNewsDashboardTab(
  'US Elections',
  '2024 US Election Updates',
  [
    { slug: 'will-donald-trump-be-convicted-of-a-99e01f724b3f' },
    {
      url: 'https://www.theguardian.com/us-news/2023/jul/03/trump-hillary-clinton-president-under-indictment-comments',
    },
    { slug: 'who-will-be-the-republican-presiden-7bf11c066154' },
    { slug: 'who-will-win-the-us-2024-democratic' },
    { slug: 'who-will-win-2024-us-presidential-e' },
    { slug: 'will-a-democrat-win-the-2024-us-pre' },
    {
      url: 'https://news.yahoo.com/hurd-says-won-t-support-150448106.html',
    },
    { slug: 'will-donald-trump-participate-in-th' },
    { slug: 'will-ai-be-a-major-topic-during-the' },
    {
      url: 'https://www.thedailybeast.com/rfk-jr-presidential-campaign-boosted-by-dollar10-million-super-pac-contributions',
    },
    { slug: 'will-rfk-jr-break-his-google-trends' },
    { slug: 'will-a-third-party-candidate-receiv' },
  ]
)

const RPlace = createNewsDashboardTab('r/place', 'r/place', [
  { slug: 'will-rplace-say-fuck-spez-when-it-c' },
  {
    content: (
      <NewsTopicsContentContainer
        containerContent={
          <>
            Redditors create live animation of the anime Bad Apple:
            <Link
              className="text-indigo-500 underline"
              href="https://twitter.com/MrFoxWasTaken/status/1683184769012748288"
            >
              Watch on Twitter
            </Link>
          </>
        }
      />
    ),
  },
  { slug: 'how-long-will-rplace-last' },
  { slug: 'what-will-the-final-color-be-at-0-0' },
  { slug: 'is-this-rplace-a-good-business-move' },

  { slug: 'will-i-be-convinced-that-the-destin' },
  { slug: 'will-manifold-make-it-on-rplace' },
  { slug: 'will-destiny-be-the-most-represente' },
])

const XCom = createNewsDashboardTab('X.com', 'Twitter rebrands to X.com', [
  { url: 'https://www.bbc.co.uk/news/business-66284304' },
  { slug: 'will-twitter-rename-to-x-in-a-week' },
  { slug: 'will-graphic-designers-think-twitte' },
  { slug: 'will-x-formerly-twitter-release-cre' },
  { slug: 'at-the-end-of-2023-will-manifold-us' },
  { slug: 'will-xcom-switch-to-a-different-x-l' },
  { slug: '28-will-twitters-net-income-be-high' },
  { slug: 'when-will-twitter-actually-collapse' },
  { slug: 'will-xeeting-catch-on-as-the-new-te' },
  { slug: 'will-microsoft-win-10-million-from' },
])

const IsraeliCourt = createNewsDashboardTab(
  'Israel',
  'Israeli gov limits Supreme Court',
  [
    {
      url: 'https://www.cnn.com/2023/07/24/middleeast/israel-supreme-court-power-stripped-intl/index.html',
    },
    { slug: 'will-israel-pass-the-judicial-refor-8c16e795af91' },
    { slug: 'will-israel-pass-the-judicial-refor' },
    { slug: 'will-the-israeli-supreme-justice-co' },
    { slug: 'will-an-israeli-protester-be-killed' },
    { slug: 'will-there-be-restrictions-on-israe' },
  ]
)

export const newsContent = [
  XCom,
  IsraeliCourt,
  RPlace,
  UkraineWar,
  Threads,
  SummitNATO,
  OpenAI,
  ElonVersusZuck,
  Election2024,
  SupremeCourt,
  WestBank,
  FrenchRiots,
  GlobalWarming,
  // { title: 'Russian Coup?', content: <RussianCoupData /> },
  // { title: 'Titanic Sub', content: <MissingSubData /> },
  // { title: 'Reddit Blackout', content: <RedditBlackoutData /> },
]
