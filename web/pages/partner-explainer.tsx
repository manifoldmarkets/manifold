import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'

export default function PartnerExplainer() {
  const user = useUser()
  return (
    <Page trackPageView={'partner explainer'}>
      <SEO
        title="Partner Explainer"
        description="About Manifold's Creator Partner Program"
      />
      <Col className="p-4">
        <Title className="hidden sm:flex">
          How does the Creator Partner Program work?
        </Title>
        <Col className="gap-4">
          <div>
            Manifold's Creator Partner Program allows users to{' '}
            <b>monetise their questions and receive USD income</b> for getting
            traders.
          </div>
          {user ? (
            <div>
              View your{' '}
              <a
                href={`/${user.username}/partner`}
                className="text-primary-500 hover:text-primary-700 hover:underline"
              >
                partner progress here
              </a>
              .
            </div>
          ) : null}
          <div className=" text-sm">
            Legal Clarification: {''}
            <i>
              This does not allow mana to be converted to USD nor provide any
              way for users to profit real money for trading. This only provides
              real money to the creator as a reward for creating interesting
              questions.
            </i>
          </div>
          <div>
            <Subtitle className=" !mt-2">Partner perks</Subtitle>
            <li>Earn real USD for getting traders on your markets.</li>
            <li>Exclusive badge. </li>
            <li> Direct access and support from the Manifold team.</li>
            <li>
              The cost of being a partner is that you will no longer receive
              mana for unique trader bonuses.
            </li>
            <li>
              Market creation is also increased to 600 mana for Yes/No (400 will
              go to liquidity) and 100 mana per answer on multi-choice.
            </li>
          </div>
          <div>
            <Subtitle className=" !mt-2">How to become a partner</Subtitle>
            <div>
              {' '}
              <b>Minimum Requirements:</b>
            </div>

            <li>10 markets in the last 90 days</li>
            <li>Average of 10 unique traders per market</li>
            <li>500 unique traders</li>

            <div className="pt-2">
              <b>
                Meeting the minimum requirements does not guarantee partnership.
                We also take into consideration user behaviour and market
                quality. This includes:
              </b>
            </div>

            <li>Concise and representative market titles.</li>
            <li>Detailed market descriptions.</li>
            <li>
              Good management of markets including actively clarifying any
              confusion whether from the comments or unexpected events.
            </li>
            <li>Timely, accurate resolutions.</li>
            <li>
              Any previous infractions of the{' '}
              <a
                href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
                className="text-primary-500 hover:text-primary-700 hover:underline"
              >
                Community Guidelines.
              </a>{' '}
            </li>
          </div>
          <div>
            <Subtitle className=" !mt-2">How to apply</Subtitle>
            <div>
              Please email {''}
              <a
                href="mailto:david@manifold.markets"
                className="text-primary-500 hover:text-primary-700 hover:underline"
              >
                david@manifold.markets
              </a>{' '}
              once you meet the minimum criteria and want to join the program.{' '}
              {''}
              {user ? (
                <a>
                  You can check how close you are to qualifying at your {''}
                  <a
                    href={`/${user.username}/partner`}
                    className="text-primary-500 hover:text-primary-700 hover:underline"
                  >
                    partner dashboard
                  </a>
                  !
                </a>
              ) : null}
            </div>
          </div>
          <div>
            <Subtitle className=" !mt-2">How income is calculated</Subtitle>
            <div>
              <b>Income amount:</b>
            </div>
            <li>$0.10 per unique trader since becoming partner.</li>
            <li>
              An additional $0.40 per unique referred trader (ie. a new user who
              was linked to your market and signed up to bet on it).
            </li>
            <div className="pt-2">
              <b>Only certain questions contribute towards income:</b>
            </div>
            <li>
              Question type: Must be a Yes/No question or a Multiple Choice.
            </li>
            <li>
              Trader threshold: Markets must have at least 25 traders. Markets
              which have less than 25 once the quarter ends will not contribute,
              but may contribute to a future quarter if the market at some point
              passes 25 traders.
            </li>
            <li>
              Subsidized: The market must be subsidized. Most are by default.
              See why your market may become unsubsidized in our{' '}
              <a
                href="https://manifoldmarkets.notion.site/Guidance-for-running-a-market-8cb4257ed3644ec9a1d6cc6c705f7c77?pvs=4"
                className="text-primary-500 hover:text-primary-700 hover:underline"
              >
                guidelines
              </a>
              .
            </li>
            <div className="pt-2">
              <b>Disclaimer:</b>
            </div>
            <li>
              Income will be capped at $3,000 per creator for this first,
              current quarter. We hope to remove this cap in the future.
            </li>
            <li>
              Manifold reserves the right to deduct or void your income for the
              current quarter if we believe you are abusing any loopholes or
              breaking our Community Guidelines.
            </li>
            <li>
              Manifold may revoke your partnership if you break our Community
              Guidelines or we feel the quality of your markets continues to
              significantly lower, even after warnings.
            </li>
          </div>
          <div>
            <Subtitle className=" !mt-2">Receiving Payment</Subtitle>
            <li>
              To receive payment, creators must have a valid PayPal account. By
              default, the email associated with your Manifold account will be
              used. If your PayPal uses a different email, please clarify this
              in your bio.
            </li>
            <li>Payments to all creators will be processed quarterly.</li>
            <li>
              If quarterly income does not exceed $10, it may be rolled over
              into the following quarter and not paid out until that threshold
              is met.
            </li>
          </div>
        </Col>
      </Col>
    </Page>
  )
}
