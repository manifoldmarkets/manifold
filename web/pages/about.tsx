import { cloneElement } from 'react'
import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import styles from './about.module.css'

export default function About() {
  return (
    <Page>
      <SEO title="About" description="About" url="/about" />
      <Contents />
    </Page>
  )
}

// Return a copy of the JSX node tree, with the style applied
const cloneWithStyle = (node: JSX.Element) => {
  // Base case: Node is a string
  if (!node.type) return node

  // Find the appropriate style from the module.css
  const className = styles[node.type]

  // Recursively call this function on each child
  let children = node.props.children
  if (children?.map) {
    // Multiple child elements
    children = children.map(cloneWithStyle)
  } else if (children) {
    // Single child element
    children = cloneWithStyle(children)
  }

  // Note: This probably strips out any existing classNames
  return cloneElement(node, { className, children })
}

// Copied from https://www.notion.so/mantic/About-Mantic-Markets-7c44bc161356474cad54cba2d2973fe2
// And then run through https://markdowntohtml.com/
function Contents() {
  return cloneWithStyle(
    <div>
      <h1 id="about">About</h1>
      <hr />
      <p>
        Manifold Markets is creating better forecasting through user-created
        prediction markets.
      </p>
      <p>
        Our mission is to expand humanity&#39;s collective knowledge by making
        prediction markets accessible to all.
      </p>
      <h1 id="faq">FAQ</h1>
      <hr />
      <h3 id="what-are-prediction-markets-">What are prediction markets?</h3>
      <p>
        <strong>
          Prediction markets are a place where you can bet on the outcome of
          future events.
        </strong>
      </p>
      <p>
        Consider a question like: &quot;Will Democrats win the 2024 US
        presidential election?&quot;
      </p>
      <p>
        If I think the Democrats are very likely to win, and you disagree, I
        might offer $70 to your $30 (with the winner taking home $100 total).
        This set of bets imply a 70% probability of the Democrats winning.
      </p>
      <p>
        Now, you or I could be mistaken and overshooting the true probability
        one way or another. If so, there&#39;s an incentive for someone else to
        bet and correct it! Over time, the implied probability will converge to
        the{' '}
        <a href="https://en.wikipedia.org/wiki/Efficient-market_hypothesis">
          market&#39;s best estimate
        </a>
        . This is the power of prediction markets!
      </p>
      <h3 id="how-does-manifold-markets-work-">
        How does Manifold Markets work?
      </h3>
      <ol>
        <li>
          <strong>
            Anyone can create a market for any yes-or-no question.
          </strong>
        </li>
        <p>
          You can ask questions about the future like &quot;Will Taiwan remove
          its 14-day COVID quarantine by Jun 01, 2022?&quot; Then use the
          information to plan your trip.
        </p>
        <p>
          You can also ask subjective, personal questions like &quot;Will I
          enjoy my 2022 Taiwan trip?&quot;. Then share the market with your
          family and friends.
        </p>
        <li>
          <strong>
            Anyone can bet on a market using Manifold Dollars (M$), our platform
            currency.
          </strong>
        </li>
      </ol>
      <p>
        You get M$ 1,000 just for signing up, so you can start betting
        immediately! When a market creator decides an outcome in your favor,
        you&#39;ll win Manifold Dollars from people who bet against you.
      </p>
      {/* <p>
        If you run out of money, you can purchase more at a rate of $1 USD to M$
        100. (Note that Manifold Dollars are not convertible to cash and can only
        be used within our platform.)
      </p> */}
      <aside>
        💡 We&#39;re still in Open Beta; we&#39;ll tweak the amounts of Manifold
        Dollars given out and periodically reset balances before our official
        launch.
        {/* If you purchase
        any M$ during the beta, we promise to honor that when we launch! */}
      </aside>

      {/* <h3 id="why-do-i-want-to-bet-with-play-money-">
        Why do I want to bet with play-money?
      </h3>
      <p>
        Prediction markets work best when bettors have skin in the game. By
        restricting the supply of our currency, you know that the other bettors
        have thought carefully about where to spend their M$, and that the
        market prices line up with reality.
      </p>
      <p>By buying M$, you support:</p>
      <ul>
        <li>The continued development of Manifold Markets</li>
        <li>Cash payouts to market creators (TBD)</li>
        <li>Forecasting tournaments for bettors (TBD)</li>
      </ul>
      <p>
        We also have some thoughts on how to reward bettors: physical swag,
        exclusive conversations with market creators, NFTs...? If you have
        ideas, let us know!
      </p> */}
      <h3 id="can-prediction-markets-work-without-real-money-">
        Can prediction markets work without real money?
      </h3>
      <p>
        Yes! There is substantial evidence that play-money prediction markets
        provide real predictive power. Examples include{' '}
        <a href="http://www.electronicmarkets.org/fileadmin/user_upload/doc/Issues/Volume_16/Issue_01/V16I1_Statistical_Tests_of_Real-Money_versus_Play-Money_Prediction_Markets.pdf">
          sports betting
        </a>{' '}
        and internal prediction markets at firms like{' '}
        <a href="https://www.networkworld.com/article/2284098/google-bets-on-value-of-prediction-markets.html">
          Google
        </a>
        .
      </p>
      <p>
        Our overall design also ensures that good forecasting will come out on
        top in the long term. In the competitive environment of the marketplace,
        bettors that are correct more often will gain influence, leading to
        better-calibrated forecasts over time.
      </p>
      <h3 id="how-are-markets-resolved-">How are markets resolved?</h3>
      <p>
        The creator of the prediction market decides the outcome and earns 1% of
        the betting pool for their effort.
      </p>
      <p>
        This simple resolution mechanism has surprising benefits in allowing a
        diversity of views to flourish. Competition between market creators will
        lead to traders flocking to the creators with good judgment on market
        resolution.
      </p>
      <p>
        What&#39;s more, when the creator is free to use their judgment, many
        new kinds of prediction markets can be created that are less objective
        or even personal. (E.g. &quot;Will I enjoy participating in the
        Metaverse in 2023?&quot;)
      </p>
      <h3 id="why-is-this-important-">Why is this important?</h3>
      <p>
        Prediction markets aggregate and reveal crucial information that would
        not otherwise be known. They are a bottom-up mechanism that can
        influence everything from politics, economics, and business, to
        scientific research and education.
      </p>
      <p>
        Prediction markets can predict{' '}
        <a href="https://www.pnas.org/content/112/50/15343">
          which research papers will replicate
        </a>
        ; which drug is the most effective; which policy would generate the most
        tax revenue; which charity will be underfunded; or, which startup idea
        is the most promising.
      </p>
      <p>
        By surfacing and quantifying our collective knowledge, we as a society
        become wiser.
      </p>
      <h3 id="how-is-this-different-from-metaculus-or-hypermind-">
        How is this different from Metaculus or Hypermind?
      </h3>
      {/* <p>
        We believe that in order to get the best results, you have to have skin
        in the game. We require that people use real money to buy the currency
        they use on our platform.
      </p>
      <p>
        With Manifold Dollars being a scarce resource, people will bet more
        carefully and can&#39;t rig the outcome by creating multiple accounts.
        The result is more accurate predictions.
      </p> */}
      <p>
        Manifold Markets is focused on accessibility and allowing anyone to
        quickly create and judge a prediction market. When we all have the power
        to create and share prediction markets in seconds and apply our own
        judgment on the outcome, it leads to a qualitative shift in the number,
        variety, and usefulness of prediction markets.
      </p>

      <h3 id="how-does-betting-work">How does betting work?</h3>
      <ul>
        <li>Markets are structured around a question with a binary outcome.</li>
        <li>
          Traders can place a bet on either YES or NO. The trader receives some
          shares of the betting pool. The number of shares depends on the
          current probability.
        </li>
        <li>
          When the market is resolved, the traders who bet on the correct
          outcome are paid out of the final pool in proportion to the number of
          shares they own.
        </li>
      </ul>

      <h3 id="type-of-market-maker">What kind of betting system do you use?</h3>
      <p>
        Manifold Markets uses a special type of automated market marker based on
        a dynamic pari-mutuel (DPM) betting system.
      </p>
      <p>
        Like traditional pari-mutuel systems, your payoff is not known at the
        time you place your bet (it&#39;s dependent on the size of the pool when
        the event is resolved).
      </p>
      <p>
        Unlike traditional pari-mutuel systems, the price or probability that
        you buy in at changes continuously to ensure that you&#39;re always
        getting fair odds.
      </p>
      <p>
        The result is a market that can function well when trading volume is low
        without any risk to the market creator.
      </p>

      <h3 id="who-are-we-">Who are we?</h3>
      <p>Manifold Markets is currently a team of three:</p>
      <ul>
        <li>James Grugett</li>
        <li>Stephen Grugett</li>
        <li>Austin Chen</li>
      </ul>
      <p>
        We&#39;ve previously launched consumer-facing startups (
        <a href="https://throne.live/">Throne</a>,{' '}
        <a href="http://oneword.games/platform">One Word</a>), and worked at top
        tech and finance companies (Google, Susquehanna).
      </p>
      <h1 id="talk-to-us-">Talk to us!</h1>
      <hr />
      <p>
        Questions? Comments? Want to create a market? Talk to us — unlike
        praying mantises, we don’t bite!
      </p>
      <ul>
        <li>
          Email: <code>info@manifold.markets</code>
        </li>
        <li>
          Office hours:{' '}
          <a href="https://calendly.com/austinchen/mantic">Calendly</a>
        </li>
        <li>
          Chat:{' '}
          <a href="https://discord.gg/eHQBNBqXuh">
            Manifold Markets Discord server
          </a>
        </li>
      </ul>
      <p></p>

      <h1 id="further-reading">Further Reading</h1>
      <hr />

      <ul>
        <li>
          <a href="https://manifoldmarkets.notion.site/Technical-Guide-to-Manifold-Markets-b9b48a09ea1f45b88d991231171730c5">
            Technical Guide to Manifold Markets
          </a>
        </li>
        <li>
          <a href="https://sideways-view.com/2019/10/27/prediction-markets-for-internet-points/">
            Paul Christiano: Prediction markets for internet points
          </a>
        </li>
        <li>
          <a href="https://thezvi.wordpress.com/2021/12/02/covid-prediction-markets-at-polymarket/">
            Zvi Mowshowitz on resolving prediction markets
          </a>
        </li>
      </ul>
    </div>
  )
}
