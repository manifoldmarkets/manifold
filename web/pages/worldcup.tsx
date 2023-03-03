import Masonry from 'react-masonry-css'

import { Contract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { SiteLink } from 'web/components/widgets/site-link'
import { ContractCard } from 'web/components/contract/contract-card'
import { Spacer } from 'web/components/layout/spacer'

const player_ratings = [
  'which-player-will-win-the-golden-bo',
  'which-goalkeeper-will-win-the-golde',
  'which-player-will-win-the-golden-ba-7f5df675c9b0',
  'which-player-will-win-the-fifa-youn',
] as string[]

const general_markets = [
  'which-team-will-win-the-2022-fifa-w',
  // 'will-a-team-score-7-or-more-goals-i',
  // 'will-germany-reach-the-world-cup-qu',
  'will-we-have-a-messi-vs-ronaldo-fin',
] as string[]

// const br_cr = [
//   'who-will-be-man-of-the-match-in-arg-8ce9e2a53739',
//   'will-argentina-eliminate-croatia-in',
//   'will-messi-score-a-goal-vs-croatia',
// ]
// const nl_arg = [
//   'who-will-be-man-of-the-match-in-fra-47fe2b9e0483',
//   'will-france-eliminate-morocco-in-th',
//   'will-france-vs-morocco-go-to-a-pena',
// ]

// const mor_por = [
//   'who-will-be-man-of-the-match-in-mor',
//   'will-morocco-eliminate-portugal',
//   'will-moroccos-goalkeeper-save-a-pen',
// ]

const uk_fr = [
  'will-argentina-win-the-fifa-world-c-bf4a7e33fba8',
  // 'will-croatia-win-the-fifa-world-cup',
  'will-france-win-the-fifa-world-cup',
  // 'will-morocco-win-the-fifa-world-cup',
]

const final = [] as string[]

// const group_winners = [
//   // groups A through H
//   'which-team-will-win-group-a',
//   'which-team-will-win-group-b',
//   'which-team-will-win-group-c',
//   'which-team-will-win-group-d',
//   'which-team-will-win-group-e',
//   'which-team-will-win-group-f',
//   'which-team-will-win-group-g',
//   'which-team-will-win-group-h',
// ]

// const group_runnerups = [
//   'which-team-will-finish-2nd-in-group',
//   'which-team-will-finish-2nd-in-group-4dfb5e86a538',
//   'which-team-will-finish-2nd-in-group-9a6a9ce8c548',
//   'which-team-will-finish-2nd-in-group-ca47ae80f852',
//   'which-team-will-finish-2nd-in-group-f244b90960d0',
//   'which-team-will-finish-2nd-in-group-17b7655095d7',
//   'which-team-will-finish-2nd-in-group-98fd8698c4d3',
//   'which-team-will-finish-2nd-in-group-87644ea5dc4b',
// ]

// const round_of_16 = [
//   // // Sat 3rd
//   'will-the-netherlands-beat-the-usa',
//   'who-will-be-man-of-the-match-in-the',
//   'will-argentina-beat-australia',
//   'who-will-be-man-of-the-match-in-arg',
//   // // Sun 4th
//   'will-france-beat-poland',
//   'who-will-be-man-of-the-match-in-fra',
//   'will-england-beat-senegal',
//   'who-will-be-man-of-the-match-in-eng',
//   // Mon 5th
//   'will-croatia-eliminate-japan-687997d7af70',
//   'who-will-be-man-of-the-match-in-cro',
//   'will-brazil-eliminate-south-korea',
//   'who-will-be-man-of-the-match-in-bra',
//   // Tue 6h TBD
//   'will-spain-eliminate-morocco',
//   'who-will-be-man-of-the-match-in-spa',
//   'will-portugal-eliminate-switzerland',
//   'who-will-be-man-of-the-match-in-por',
// ]

export async function getStaticProps() {
  const ukFr = await getContractsFromSlugs(uk_fr)

  const finals = await getContractsFromSlugs(final)

  const playerRatings = await getContractsFromSlugs(player_ratings)

  const generalMarkets = await getContractsFromSlugs(general_markets)

  return {
    props: {
      ukFr,
      finals,
      playerRatings,
      generalMarkets,
    },
    revalidate: 60, // regenerate after a minute
  }
}

const getContractsFromSlugs = async (slugs: string[]) => {
  const contracts = (
    await Promise.all(
      slugs.map(async (slug) => {
        const contract = await getContractFromSlug(slug)
        return contract ?? null
      })
    )
  ).filter((contract) => contract != null)
  return contracts ?? []
}

export default function WorldCup(props: {
  ukFr: Contract[]
  finals: Contract[]
  playerRatings: Contract[]
  generalMarkets: Contract[]
}) {
  const { playerRatings, ukFr } = props

  return (
    <Page className="">
      <div className={'relative p-1 px-4 pt-0'}>
        <Col className="mx-auto max-w-7xl">
          <SEO
            title="World Cup 2022"
            description="Manifold's 2022 FIFA World Cup forecast. Place your bets and win up to $500 USD in our tournament."
            image="" // TODO: Add image for preview
          />

          <div className="text-primary-700 mb-2 text-5xl">World Cup 2022</div>

          <div className="text-ink-1000 my-4 text-base">
            Manifold's 2022 FIFA World Cup forecast. Place your bets and{' '}
            <SiteLink href="#rules">
              win up to $500 USD in our tournament
            </SiteLink>
            .
          </div>

          <Spacer h={4} />

          {/* Might want to put an image or something here. */}

          <div className="text-primary-700 my-4 text-3xl">
            Who will win the World Cup?
          </div>
          <Masonry
            breakpointCols={{ default: 2, 768: 1 }}
            className="-ml-4 flex w-auto"
            columnClassName="pl-4 bg-clip-padding"
          >
            {ukFr?.map((contract) => (
              <ContractCard
                key={contract.slug}
                contract={contract}
                hideDetails={false}
                className="mb-4"
                showImage
              />
            ))}
          </Masonry>

          {/* <Spacer h={8} />

          <div className="mb-2 text-3xl text-primary-700">Group Stage </div>
          {isMobile && (
            <div className="mb-2  text-xl text-primary-400">
              Pick the winner and runner-up of each group
            </div>
          )}
          <Tabs
            labelClassName="text-lg"
            tabs={[
              {
                title: isMobile ? 'Winners' : 'Pick the winner of each group',
                content: groupWinnerTab,
                className: 'w-full',
              },
              {
                title: isMobile
                  ? 'Runner-ups'
                  : 'Pick the runner-up of each group',
                content: groupRunnerupTab,
                className: 'w-full',
              },
            ]}
          /> */}

          <Spacer h={16} />

          <div className="text-primary-700 mb-2 text-3xl">
            Player Performance
          </div>
          <Spacer h={4} />
          <Masonry
            breakpointCols={{ default: 2, 768: 1 }}
            className="-ml-4 flex w-auto"
            columnClassName="pl-4 bg-clip-padding"
          >
            {playerRatings.map((contract) => (
              <ContractCard
                key={contract.slug}
                contract={contract}
                hideDetails={false}
                showImage={true}
                className="mb-4"
              />
            ))}
          </Masonry>

          <Spacer h={8} />

          <Spacer h={16} />

          <Spacer h={8} />

          <div className="text-primary-700 mb-2 text-3xl" id="rules">
            Tournament rules
          </div>
          <Spacer h={4} />

          <div className="text-ink-700 mb-4 text-base">
            Manifold is sponsoring a tournament on the 2022 World Cup with a{' '}
            <strong>$500 USD prize</strong> {''}
            pool. Show off your soccer/football knowledge, and win real USD if
            you're correct.
          </div>

          <div className="text-ink-700 mb-4 text-base">
            Only markets on this page will count towards the{' '}
            <SiteLink
              href="group/fifa-2022-world-cup-1000-competitio/leaderboards"
              className="font-semibold"
            >
              tournament leaderboard
            </SiteLink>
            . Visit the{' '}
            <SiteLink href="#group/2022-fifa-world-cup">
              2022 Fifa World Cup group
            </SiteLink>
            &nbsp;to view all the other user-created World Cup markets.
          </div>
          <div className="text-ink-700 mb-4 text-base">
            A couple of new markets will be added weekly in addition to the
            existing collection.
          </div>

          <div className="text-ink-700 mb-4 text-base">
            Trading will cease at half-time for markets predicting the result of
            a match. This is to allow some live trading while ensuring users who
            are predicting in advance aren’t significantly disadvantaged by
            people who are on the site 24/7.
          </div>

          <ol className="text-ink-700 list-decimal space-y-4 px-4 text-base">
            <li>
              <p>
                USD prizes will be awarded to the top 5 traders on the
                leaderboard in proportion to profit earned in this group
                (excluding members of the Manifold team).
              </p>
            </li>
            <li>
              <p>Only 1 account per person can trade in this market.</p>
            </li>
            <li>
              <p>
                Don't collude with other people to inflate your or their
                profits.
              </p>
              <ul>
                <li>
                  <p>
                    E.g. don't transfer money to your friends account via
                    betting a market artificially high/low and having them
                    correct it.
                  </p>
                </li>
              </ul>
            </li>
            <li>
              <p>
                All forms of trading are allowed (including API, limit orders).
              </p>
            </li>
            <li>
              <p>
                Manifold reserves the right to modify rules, exclude
                participants, and other changes necessary to abide by the spirit
                of this tournament.
              </p>
            </li>
            <li>
              <p>
                Markets may occasionally be sourced from users, Manifold will
                make sure these markets are resolved correctly. If users wish to
                maintain full autonomy over their markets they may request their
                market removed from the tournament before a resolution is met.
              </p>
            </li>
          </ol>
          <Spacer h={8} />
        </Col>
      </div>
    </Page>
  )
}

export function GroupComponent(props: { group: Contract; title: string }) {
  const { group, title } = props
  return (
    <Col>
      <div className="text-  text-xl">{title} </div>

      <ContractCard
        contract={group}
        noLinkAvatar={true}
        hideQuickBet={true}
        hideGroupLink={true}
        hideQuestion={true}
        hideDetails={true}
        numAnswersFR={4}
      />
    </Col>
  )
}
