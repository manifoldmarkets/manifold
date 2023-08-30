/* eslint-disable @typescript-eslint/no-unused-vars */
import Link from 'next/link'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Col } from 'web/components/layout/col'
import { DashboardNewsItem } from 'web/components/news/dashboard-news-item'
import { NewsTopicsContentContainer } from 'web/components/widgets/news-topics-content-container'
import { Title } from 'web/components/widgets/title'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { ExternalLink } from '../widgets/external-link'
import { createNewsDashboardTab } from './news-dashboard'

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
  ],
  <img
    src="https://cdn.vox-cdn.com/uploads/chorus_asset/file/24771180/heat_waves_download1_2022.png"
    className="mb-4"
  />
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
    url: 'https://apnews.com/article/russia-ukraine-war-drone-strikes-odesa-kyiv-8b20147a55f29a0c0bc465b59274357e',
  },
  { slug: 'will-moscow-be-hit-by-another-drone' },
  { url: 'https://www.bbc.co.uk/news/world-europe-66374032' },

  { slug: 'how-will-the-ukrainerussia-border-l' },
  { slug: 'will-any-part-of-the-zaporizhzhia-n' },
  { slug: 'will-russia-nuke-ukraine' },
  {
    slug: 'will-vladimir-putin-still-be-the-le',
  },
  { slug: 'will-ukraine-regain-control-over-cr' },
  { slug: 'will-ukraine-sever-the-land-bridge' },
  { slug: 'will-the-ukraine-war-be-over-by-the' },
  { slug: '5-will-there-be-a-lasting-ceasefire' },
  { slug: 'will-china-convene-and-mediate-peac' },
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
    {
      url: 'https://abcnews.go.com/US/wireStory/musk-cage-fight-zuckerberg-streamed-102053512',
    },
    { slug: 'will-elon-musk-and-mark-zuckerberg-bd28b2349d95' },
    { slug: 'if-elon-zuck-fight-will-it-be-at-th' },
    {
      url: 'https://nypost.com/2023/06/30/elon-musk-mark-zuckerberg-can-fight-at-colosseum-italian-govt/',
    },
    { slug: 'when-will-the-zuckerberg-vs-musk-fi' },
    { slug: 'conditional-in-the-fight-between-mu' },
    { slug: 'if-elon-zuck-fight-will-either-brea' },
    { slug: 'if-the-elon-musk-vs-zuckerberg-figh-92350f63685f' },
  ],
  <img
    src="https://media.discordapp.net/attachments/1100471650392223834/1121601859073871943/image0.jpg?width=862&height=686"
    width={862}
    height={200}
    alt=""
    className="mb-4"
  />
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
      {/* <NewsGrid> */}
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
      {/* </NewsGrid> */}
    </Col>
  )
}

const Election2024 = createNewsDashboardTab(
  'US 2024',
  '2024 US Election Updates',
  [
    { slug: 'will-the-august-23-2023-republican' },
    { slug: 'will-vivek-ramaswamys-poll-numbers' },
    { slug: 'will-vivek-ramaswamy-win-the-septem' },
    { slug: 'will-vivek-ramaswamy-win-the-august' },
    { slug: 'will-donald-trump-be-convicted-of-a-99e01f724b3f' },
    { slug: 'who-will-be-the-republican-presiden-7bf11c066154' },
    { slug: 'who-will-win-the-us-2024-democratic' },
    { slug: 'who-will-win-2024-us-presidential-e' },
    { slug: 'will-a-democrat-win-the-2024-us-pre' },
    { slug: 'will-donald-trump-participate-in-th' },
    { slug: 'will-ai-be-a-major-topic-during-the' },

    { slug: 'will-a-third-party-candidate-receiv' },
    {
      url: 'https://www.npr.org/2023/08/25/1195726967/where-the-gop-primary-stands-with-trump-still-front-and-center',
    },
  ]
)

const RPlace = createNewsDashboardTab(
  'r/place',
  'r/place',
  [
    { slug: 'will-rplace-say-fuck-spez-when-it-c' },
    { slug: 'how-long-will-rplace-last' },
    { slug: 'what-will-the-final-color-be-at-0-0' },
    { slug: 'is-this-rplace-a-good-business-move' },

    { slug: 'will-i-be-convinced-that-the-destin' },
    { slug: 'will-manifold-make-it-on-rplace' },
    { slug: 'will-destiny-be-the-most-represente' },
  ],
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
)

const XCom = createNewsDashboardTab('X.com', 'Twitter rebrands to X.com', [
  { url: 'https://www.bbc.co.uk/news/business-66284304' },
  { slug: 'will-twitter-rename-to-x-in-a-week' },
  { slug: 'will-graphic-designers-think-twitte' },
  { slug: 'will-x-formerly-twitter-release-cre' },
  { slug: 'at-the-end-of-2023-will-manifold-us' },
  { slug: 'will-twitter-remove-rate-limits-by' },
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

const STPSuper = createNewsDashboardTab(
  'Superconductor',
  'Scientists announce room temp superconductor',
  [
    { slug: 'will-the-lk99-room-temp-ambient-pre' },
    { slug: 'when-will-we-know-whether-the-room' },
    { slug: 'will-there-be-a-highcredibility-spu' },
    { slug: 'will-the-first-roomtemperature-ambi' },
    { slug: 'will-we-have-the-first-roomtemperat' },
    { slug: 'will-a-roomtemperature-atmospheric' },
    { slug: 'will-the-first-roomtemperature-ambi-61c98e502e09' },
    { slug: 'which-financial-instruments-should' },
  ],
  <Col className="gap-4">
    <ExternalLink title="Main Paper" href="https://arxiv.org/abs/2307.12008" />

    <ExternalLink
      title="Companion Paper"
      href="https://arxiv.org/abs/2307.12037"
    />

    <ExternalLink
      title="First claims of replication from China"
      href="https://www.zhihu.com/question/613850973/answer/3136316439?utm_id=0"
    />

    <ExternalLink
      title="What would RTP superconductors mean?"
      href="https://theconversation.com/room-temperature-superconductors-could-revolutionize-electronics-an-electrical-engineer-explains-the-materials-potential-201849"
    />

    <ExternalLink
      title="Hacker News thread discussion"
      href="https://news.ycombinator.com/item?id=36864624"
    />

    <ExternalLink
      title="Table of all current replication attempts"
      href="https://forums.spacebattles.com/threads/claims-of-room-temperature-and-ambient-pressure-superconductor.1106083/page-11?post=94266395#post-94266395"
    />

    <ExternalLink
      title="Chinese team finds theoretical basis for LK-99 superconductivity"
      href="https://arxiv.org/abs/2307.16040"
    />

    <p className="mb-4">
      Materials used are relatively cheap and not complicated, so it should be
      easy for others to replicate.
    </p>
  </Col>
)

const UFOs = createNewsDashboardTab(
  'UFOs',
  'Intel officer claims UFOs recovered',
  [
    {
      url: 'https://www.npr.org/2023/07/27/1190390376/ufo-hearing-non-human-biologics-uaps',
    },
    { slug: 'will-claims-of-a-retrieved-craft-of' },
    { slug: 'will-a-highranking-us-official-endo' },
    { slug: 'will-the-us-government-confirm-the' },
    { slug: 'will-the-ufo-retrieval-program-clai' },
    { slug: 'will-the-next-state-of-the-union-ad' },
    { slug: 'will-the-us-government-reveal-that' },
    { slug: 'will-the-president-of-the-usa-ackno' },
    { slug: 'by-2025-over-60-of-americans-will-b' },
    { slug: 'will-a-clear-4k-video-of-a-uap-be-r' },
    { slug: 'will-eliezer-yudkowsky-win-his-1500' },
    { slug: 'will-the-ufo-shot-down-in-alaska-on' },
    { slug: 'if-eliezer-yudkowsky-loses-his-bet' },
  ],
  <Col>
    <iframe
      className="mb-4 h-48 w-full"
      src="https://www.youtube.com/embed/KQ7Dw-739VY?start=2550"
      title="Grusch UFO testimony"
      allow=""
    ></iframe>
  </Col>
)

const Trump = createNewsDashboardTab(
  'Trump',
  'Trump indicted',
  [
    {
      url: 'https://www.nbcnews.com/politics/donald-trump/federal-judge-set-trump-trial-date-election-interference-case-rcna101669',
    },
    { slug: 'when-will-trump-be-imprisoned' },

    { slug: 'will-donald-trump-be-the-republican' },
    { slug: 'will-a-trump-mugshot-be-available-b' },
    { slug: 'will-one-of-the-18-indicted-coconsp' },
    { slug: 'will-donald-trumps-height-be-62-or' },
    { slug: 'will-donald-trump-weigh-280-pounds' },
    { slug: 'will-trump-be-indicted-by-three-or' },
    { slug: 'who-will-be-the-republican-presiden-7bf11c066154' },
    { slug: 'is-trump-more-likely-to-spend-1-nig' },
    { slug: 'will-there-be-large-scale-protests' },
  ],
  <Col className="gap-4">
    <div>Trump faces 4th criminal case, August 14th</div>
    <div>
      “The indictment alleges that rather than abide by Georgia's legal process
      for election challenges, the defendants engaged in a criminal racketeering
      enterprise to overturn Georgia's presidential election result,” Fulton
      County District Attorney Fani Willis
    </div>
    <div>Odds of Trump avoiding prison were at 60% but fell to 23%</div>
    <div>
      The type of charges (RICO) being pressed is novel in this context and is
      usually used against criminal organisations{' '}
    </div>
  </Col>
)

const NigerCoup = createNewsDashboardTab('Niger coup', 'Niger coup', [
  {
    url: 'https://apnews.com/article/niger-coup-west-africa-use-of-force-mali-burkina-faso-0b951ec77a89033c84e6f0972cc21b5f',
  },
  { slug: 'will-the-coup-in-niger-succeed' },
  { slug: 'will-ecowas-militarily-intervene-in' },
  { slug: 'will-president-bazoum-of-niger-be-r' },
  { slug: 'will-us-troops-participate-in-a-mil' },
  { slug: 'conditional-upon-a-military-interve' },
  { slug: 'what-will-the-human-development-ind-11efb7344aca' },
])

const CancerPill = createNewsDashboardTab(
  'Cancer pill',
  'AOH1996 = miracle cancer pill?',
  [
    { slug: 'is-the-pcnatargeting-cancer-drug-pa' },
    { slug: 'will-aoh1996-be-fda-approved-before' },
    { slug: 'when-will-the-100-effective-against-7a6fcbc9b217' },
    { slug: 'will-aoh1996-succeed-in-phase-i-tri' },
    { slug: 'will-the-preclinical-results-on-the' },
  ],
  <NewsTopicsContentContainer
    header="Facts"
    containerContent={
      <>
        <p className="mb-4">
          A new study claims oral cancer drug AOH1996 kills 100% of solid tumors
          across many cancer types in animals with no discernible side effects.
        </p>
        <p className="mb-4">
          The drug works by interfering with PCNA which clamps DNA to allow
          replication tools to attach.
        </p>
        <p className="mb-4">The drug is in Phase I clinical trials.</p>

        <ExternalLink
          className="mb-4"
          title="Main paper"
          href="https://www.cell.com/cell-chemical-biology/pdfExtended/S2451-9456(23)00221-0"
        />
      </>
    }
  />
)

const PlaneCrash = createNewsDashboardTab(
  'Plane Crash',
  'Prigozhin feared dead on plane crash',
  [
    { slug: 'will-yevgeny-prigozhin-be-killed-du' },
    {
      slug: 'https://www.reuters.com/world/europe/us-believes-missile-inside-russia-likely-shot-down-prigozhins-presumed-plane-us-2023-08-24/',
    },
    { url: 'https://www.bbc.com/news/live/world-66599774' },
    { slug: 'what-will-be-the-cause-of-the-prigo' },
    { slug: 'conditional-on-prigozhin-plane-cras' },
    { slug: 'will-putin-imply-he-was-directly-re' },
    { slug: 'prigozhin-dies-in-a-plane-crash' },
    { slug: 'will-prigozhin-outlast-a-head-of-ca' },
  ]
)

const FLHurricane = createNewsDashboardTab(
  'Gulf Hurricane',
  'Tropical Storm Idalia likely to become hurricane',
  [
    {
      url: 'https://edition.cnn.com/us/live-news/hurricane-idalia-path-florida-08-30-23/index.html',
    },
    { slug: 'will-hurricane-idalia-cost-150-live' },
    { slug: 'in-2023-will-a-hurricane-make-landf' },
    { slug: 'will-tropical-storm-idalia-become-a' },

    { slug: 'will-a-hurricane-make-landfall-in-f-736c1b6b35db' },
    { slug: 'will-a-hurricane-hit-the-state-of-f' },
    { slug: 'will-a-hurricane-make-landfall-in-l-d39166018a46' },
    { slug: 'will-a-hurricane-make-landfall-in-t-d9549c66acae' },
  ]
)

export const newsContent = [
  FLHurricane,
  Election2024,
  Trump,
  STPSuper,
  PlaneCrash,
  ElonVersusZuck,
  UkraineWar,
  NigerCoup,
  UFOs,
  XCom,
]
