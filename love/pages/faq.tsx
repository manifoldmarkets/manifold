import { LovePage } from 'love/components/love-page'
import ManifoldLoveLogo from 'love/components/manifold-love-logo'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'

export default function FAQ() {
  return (
    <LovePage trackPageView={'faq'}>
      <SEO title="FAQ" description="Manifold.love FAQ" />

      <Col className="p-4">
        <Title className="hidden sm:flex">FAQ</Title>
        <ManifoldLoveLogo className="mb-4 flex sm:hidden" />

        <div className="mb-4 text-lg font-semibold">
          How does resolution work for relationship markets?
        </div>
        <div className="mb-2">
          There are four markets describing relationship milestones:
        </div>
        <Col className="mb-4 ml-4 gap-2">
          <div>1. First date by Dec 10?</div>
          <div>2. If first date, second date within two weeks?</div>
          <div>3. If second date, third date within two weeks?</div>
          <div>4. If third date, continue relationship for six months?</div>
        </Col>
        <Col className="gap-2">
          <div>
            Each can be resolved by the daters by confirming each next
            milestone. Alternately, choosing "Unmatch" will resolve all the
            markets.{' '}
          </div>
          <div>
            Note that besides the first date market, the other markets are
            conditional. That means that they will resolve to N/A if their
            condition is not met, meaning all trades will be reversed for 0
            profit.
          </div>
          <div>
            For example, if someone unmatches before the first date happens, the
            first date market will resolve NO, but the others will resolve N/A.
          </div>
          <div />
          <div className="font-semibold">Rules for each market</div>
          <div>
            For 1, the date must start by the end of the date specified.
          </div>
          <div>
            For 2-3, the two-week countdown starts from the day the last date
            happened. So if you went on a first date on Dec 3, then you would
            have until the end of Dec 17 to go on a second date for the market
            to resolve YES.
          </div>
          <div>
            For 4, the six-month countdown starts from the day of the third date
            and operates on calendar months. So if your third date was on Jan 4,
            then you have to be in the same relationship until June 4 for the
            market to resolve YES.
          </div>
          <div>
            Note that if a breakup happens but then the couple gets back
            together, 4 would resolve NO, because it was not a continuous six
            months, unless the breakup was less than two weeks.
          </div>
        </Col>
      </Col>
    </LovePage>
  )
}
