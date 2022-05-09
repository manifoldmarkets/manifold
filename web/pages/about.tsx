import { cloneElement } from 'react'
import { CREATOR_FEE } from 'common/fees'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import styles from './about.module.css'

export default function About() {
  return (
    <Page margin>
      <SEO title="About" description="About" url="/about" />
      <div className="prose lg:prose-lg mx-auto text-gray-700">
        <Contents />
      </div>
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
      <h2 id="about">About</h2>
      <p>
        Manifold Markets lets anyone create a prediction market on any topic.
        Win virtual money betting on what you know, from{' '}
        <a href="https://manifold.markets/SG/will-magnus-carlsen-lose-any-regula">
          chess tournaments
        </a>{' '}
        to{' '}
        <a href="https://manifold.markets/Duncan/will-the-wayward-falcon-9-booster-h">
          lunar collisions
        </a>{' '}
        to{' '}
        <a href="https://manifold.markets/Nu%C3%B1oSempere/how-many-additional-subscribers-wil">
          newsletter subscriber rates
        </a>{' '}
        - or learn about the future by creating your own market!
      </p>
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
        . Since these probabilities are public, anyone can use them to make
        better decisions!
      </p>
      <h3 id="how-does-manifold-markets-work-">
        How does Manifold Markets work?
      </h3>
      <ol>
        <li>
          <strong>
            Anyone can create a market for any yes-or-no question.
          </strong>
          <p>
            You can ask questions about the future like &quot;Will Taiwan remove
            its 14-day COVID quarantine by Jun 01, 2022?&quot; If the market
            thinks this is very likely, you can plan more activities for your
            trip.
          </p>
          <p>
            You can also ask subjective, personal questions like &quot;Will I
            enjoy my 2022 Taiwan trip?&quot;. Then share the market with your
            family and friends and get their takes!
          </p>
        </li>
        <li>
          <strong>
            Anyone can bet on a market using Manifold Dollars (M$), our platform
            currency.
          </strong>
          <p>
            You get M$ 1,000 just for signing up, so you can start betting
            immediately! When a market creator decides an outcome in your favor,
            you&#39;ll win Manifold Dollars from people who bet against you.
          </p>
        </li>
      </ol>
      <p>
        More questions? Check out{' '}
        <a href="https://outsidetheasylum.blog/manifold-markets-faq/">
          this community-driven FAQ
        </a>
        !
      </p>
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
      <p>
        Since our launch, we've seen hundreds of users trade each day, on over a
        thousand different markets! You can track the popularity of our platform
        at{' '}
        <a href="http://manifold.markets/analytics">
          http://manifold.markets/analytics
        </a>
        .
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
        tax revenue; which charity will be underfunded; or which startup idea is
        the most promising. By surfacing and quantifying our collective
        knowledge, we as a society become wiser.
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

      <h3 id="how-are-markets-resolved-">How are markets resolved?</h3>
      <p>
        The creator of the prediction market decides the outcome and earns{' '}
        {CREATOR_FEE * 100}% of trader profits. as a commission for creating and
        resolving the market.
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
      {/* <h3 id="how-is-this-different-from-metaculus-or-hypermind-">
        How is this different from Metaculus or Hypermind?
      </h3> */}
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
      {/* <p>
        Manifold Markets is focused on accessibility and allowing anyone to
        quickly create and judge a prediction market. When we all have the power
        to create and share prediction markets in seconds and apply our own
        judgment on the outcome, it leads to a qualitative shift in the number,
        variety, and usefulness of prediction markets.
      </p> */}

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
      <p>
        Read{' '}
        <a href="https://manifoldmarkets.notion.site/Technical-Guide-to-Manifold-Markets-b9b48a09ea1f45b88d991231171730c5">
          our technical guide
        </a>{' '}
        to find out more!
      </p>

      <h3 id="private-markets">Can I create private markets?</h3>
      <p>
        Soon! We're running a pilot version of Manifold for Teams - private
        Manifold instances where you can discuss internal topics and predict on
        outcomes for your organization.
      </p>
      <p>
        If this sounds like something you’d want,{' '}
        <a href="https://docs.google.com/forms/d/e/1FAIpQLSfM_rxRHemCjKE6KPiYXGyP2nBSInZNKn_wc7yS1-rvlLAVnA/viewform?usp=sf_link">
          join the waitlist here
        </a>
        !
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
        tech and trading firms (Google, Susquehanna).
      </p>
      <h2 id="talk-to-us-">Talk to us!</h2>
      <p>Questions? Comments? Want to create a market? Talk to us!</p>
      <ul>
        <li>
          Email:{' '}
          <a href="mailto:info@manifold.markets">info@manifold.markets</a>
        </li>
        <li>
          Office hours:{' '}
          <ul>
            <li>
              <a href="https://calendly.com/austinchen/manifold">
                Calendly — Austin
              </a>
            </li>
            <li>
              <a href="https://calendly.com/jamesgrugett/manifold">
                Calendly — James
              </a>
            </li>
          </ul>
        </li>
        <li>
          Chat:{' '}
          <a href="https://discord.gg/eHQBNBqXuh">
            Manifold Markets Discord server
          </a>
        </li>
      </ul>
      <p></p>

      <h2 id="further-reading">Further Reading</h2>

      <ul>
        <li>
          <a href="https://outsidetheasylum.blog/manifold-markets-faq/">
            An in-depth, unofficial FAQ by Isaac King
          </a>
        </li>
        <li>
          <a href="https://manifoldmarkets.notion.site/Technical-Guide-to-Manifold-Markets-b9b48a09ea1f45b88d991231171730c5">
            How Manifold's market maker works
          </a>
        </li>
        <li>
          <a href="https://astralcodexten.substack.com/p/play-money-and-reputation-systems">
            Scott Alexander on play-money prediction markets
          </a>
        </li>
        <li>
          <a href="https://sideways-view.com/2019/10/27/prediction-markets-for-internet-points/">
            Paul Christiano on prediction markets for internet points
          </a>
        </li>
      </ul>
    </div>
  )
}
