import { FeedItem } from 'web/components/feed/feed-items'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/page'
import { SiteLink } from 'web/components/site-link'
import { Title } from 'web/components/title'

export default function MyPage() {
  return (
    <Page>
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Title className="!mt-0 !text-5xl" text="How to Manifold" />
        <div className="">
          Manifold Markets is a novel site where users can bet against each
          other to predict the outcomes of all types of questions. Engage in
          intense discussion, have fun with friends, and become better informed
          all whilst putting play-money where your mouth is.
        </div>
        <Title text="Mana" />
        <p className="">
          Mana (M$) is our virtual play currency that cannot be converted to
          real money.
        </p>
        <div className="px-12 py-3 text-xl font-semibold">Its value </div>
        <p className="px-12 text-base">
          You can redeem your Mana and we will donate to a&nbsp;
          <SiteLink href="/charity" className="font-semibold text-blue-700 ">
            charity
          </SiteLink>
          &nbsp;on your behalf. Redeeming and purchasing Mana occurs at a rate
          of M$100 to $1. You will be able to redeem it for merch and other cool
          items soon too!
        </p>
        <div className="px-12 py-3 text-xl font-semibold">
          Its sets us apart{' '}
        </div>
        <p className="px-12 text-base">
          Using play-money sets us apart from other similar sites as we don’t
          want our users to solely focus on monetary gains. Instead we
          prioritize in providing a fun, social space to play with friends and
          facilitating a more informed world through the power of prediction
          markets.
        </p>

        <Title className="pt-2" text="How Probabilities work" />
        <p className="px-2">
          The probability of a market represents what the collective bets of
          users predict the chances of an outcome occurring is. How this is
          calculated depends on the type of market - see below!
        </p>

        <Title className="pt-2" text="Types of markets" />
        <p className="px-2">
          There are currently 3 types of markets: Yes/No (binary), Free
          response, and Numerical.
        </p>
        <div className="px-12 py-3 text-xl font-semibold">Yes/No (Binary) </div>
        <p className="px-12 text-base">
          The creator asks a question where traders can bet yes or no. The %
          represents what users believe the probability of the event occuring to
          be. Check out our{' '}
          <SiteLink
            href="http://bit.ly/maniswap"
            className="font-semibold text-blue-700"
          >
            Maniswap doc
          </SiteLink>
          &nbsp;for more info on its automated market maker.
        </p>

        <div className="px-12 py-3 text-xl font-semibold">Free response</div>
        <p className="px-12 text-base">
          The creator asks an open ended question. Both the creator and users
          can propose answers which can be bet on. Don’t be intimidated to add
          new answers! The payout system and initial liquidity rewards users who
          bet on new answers early. The algorithm used to determine the
          probability and payout is complicated but if you want to learn more
          check out this{' '}
          <SiteLink
            href="https://manifoldmarkets.notion.site/DPM-b9b48a09ea1f45b88d991231171730c5"
            className="font-semibold text-blue-700 "
          >
            DPM doc
          </SiteLink>
          .
        </p>

        <div className="px-12 py-3 text-xl font-semibold">Numerical </div>
        <p className="px-12 text-base">
          Retracted whilst we make improvements. You still may see some old ones
          floating around though. Questions which can be answered by a number
          within a given range. Betting on a value will cause you to buy shares
          from ‘buckets’ surrounding the number you choose.
        </p>
        <Title className="pt-2" text="Build your portfolio" />
        <p className="px-2">
          Generate profits to prove your expertise and shine above your friends
          on the leaderboards. To the moon 🚀
        </p>
        <div className="px-12 py-3 text-xl font-semibold">
          Find inaccurate probabilities
        </div>
        <p className="px-12 text-base">
          Use your superior knowledge on topics to identify markets which have
          inaccurate probabilities. This gives you favorable odds, so bet
          accordingly to shift the probability to what you think it should be.
        </p>

        <div className="px-12 py-3 text-xl font-semibold">React to news </div>
        <p className="px-12 text-base">
          Markets are dynamic and ongoing events can drastically affect what the
          probability should look like. Be the keenest to react and there is a
          lot of Mana to be made.
        </p>

        <div className="px-12 py-3 text-xl font-semibold">
          Buy low, sell high{' '}
        </div>
        <p className="px-12 text-base">
          Similar to a stock market, probabilities can be overvalued and
          undervalued. If you bet (buy shares) at one end of the spectrum and
          subsequently other users buy even more shares of that same type, the
          value of your own shares will increase. Sometimes it will be most
          profitable to wait for the market to resolve but often it can be wise
          to sell your shares and take the immediate profits. This can also be a
          great way to free up Mana if you are lacking funds.
        </p>
        <div className="px-12 py-3 text-xl font-semibold">
          Create innovative answers
        </div>
        <p className="px-12 text-base">
          Certain free response markets provide room for creativity! The answers
          themselves can often affect the outcome based on how compelling they
          are.
        </p>

        <p className="pt-12">
          {' '}
          Check out our&nbsp;
          <SiteLink
            href="https://docs.manifold.markets/"
            className="font-semibold text-blue-700 "
          >
            docs page
          </SiteLink>
          &nbsp;to learn more! There you will find information about specific
          market mechanisms, our API, open source projects, bounties, and more
          detailed guides.
        </p>

        <p className="pt-4">
          {' '}
          Still haven't answered your question? Join our&nbsp;
          <SiteLink
            href="https://discord.gg/eHQBNBqXuh"
            className="font-semibold text-blue-700 "
          >
            Discord server
          </SiteLink>
          &nbsp;and one of our team will be happy to talk with you!
        </p>
      </Col>
    </Page>
  )
}
