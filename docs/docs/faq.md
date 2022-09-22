# Community FAQ

## General

### Do I have to pay real money in order to participate?

Nope! Each account starts with a free 1000 mana (or M$1000 for short). If you invest it wisely, you can increase your total without ever needing to put any real money into the site.

### Can M$ be sold for real money?

No. Gambling laws put many restrictions on real-money prediction markets, so Manifold uses play money instead.

You can instead redeem your Mana and we will [donate to a charity](http://manifold.markets/charity) on your behalf. Redeeming and purchasing Mana occurs at a rate of M$100 to $1.

### How do the free response markets work?

Any user can enter a response and bet on it, or they can bet on other people's responses. The response probabilities are weighted proportionally to how many people have bet on them. The market creator's ante goes into a "none of the above" pseudo-option that can't be bet on and can't be chosen as a correct answer when the market is resolved. (This means that free response markets tend to lose their creator almost their entire ante. It also means that if there are only a finite number of options that could win, traders can make guaranteed money by investing in them all equally.) See [here](https://manifoldmarkets.substack.com/p/above-the-fold-milestones-and-new) for more information.

### How accurate are the market probabilities?

In general, prediction markets are very accurate. They do have some known issues, most of which can be found on the [Wikipedia page.](https://en.wikipedia.org/wiki/Prediction_market#Accuracy). There are also a few factors that are specific to Manifold Markets:

- Manifold uses play money for their markets, so there's less of an incentive for people to invest safely. People often goof around with silly markets and investments that they don't expect to win M$ from.
- Anyone can create a market on Manifold, and there's nothing preventing the creator of a market from trying to manipulate it to make a profit.
- Manifold Markets is a new project and has a large number of individual markets, which means that many of their markets don't have many participants, sometimes less than 5 people.
- Manifold's betting system isn't perfect and has some sources of error, discussed in detail [here](https://kevin.zielnicki.com/2022/02/17/manifold/).

As a general heuristic, check the total pool for the market in question. The more M$ there is in the market, the more likely it is to be accurate.

### Can I participate without having a Google account?

No. See [here](https://manifold.markets/hamnox/will-manifold-markets-add-nongoogle) for the probability that this changes.

## Placing and winning bets

### The payout probabilities I'm shown sometimes aren't right. For example if a market is at 15% and I bet M$1 on "no", it tells me that I'll make a 42% profit if I win, but the listed payout is just M$1. What's going on?

Payout amounts are visually rounded to the nearest M$1, and only integer amounts can be put into markets. Behind the scenes however, your balance does track fractional amounts, so you're making a M$0.42 profit on that bet. Once you win another M$0.08, that fractional M$0.5 will display as an extra M$1 in your account. (There's no way to view your exact balance, you can only see the rounded value.)

### What are the rules about insider trading? (Using private information about a market to make a profit.)

It's not only allowed, but encouraged. The whole point of a prediction market is to uncover and amplify this sort of hidden information. For example, if there's a market like "will [company] make [decision]?" and you work for that company and know what decision they're going to make, you can use that information to win M$ and make the market more accurate at the same time. (Subject to your company's policies on disclosing internal information of course.) However, if the reason you have private information is because you're colluding with the market creator, this will likely earn both of you a bad reputation and people will be less interested in participating in your markets in the future.

### Can I see who is buying/selling in a market?

All trades before June 1, 2022 are anonymous by default. Trades after that date can be viewed in the Bets tab of any market, and also on that user's profile.

## Creating and resolving markets

### Is there any benefit to creating markets?

You get your question answered! Plus, you earn a commission on trades in your markets.

### What can I create a market about?

Anything you want to! People ask about politics, science, gaming, and even [their personal lives](https://www.smbc-comics.com/?id=2418). Take a look at the [current list of markets](https://manifold.markets/markets) to see what sorts of things people ask about.

### What's the difference between a market being "closed" and being "resolved"?

A market being "closed" means that people can no longer place or sell bets, "locking in" the current probability. Markets close when the close date of the market is met. A market being "resolved" means that the market creator has indicated a given resolution to the market's question, such as "yes", "no", "N/A", or a certain probability. This is the point at which people are cashed out of the market. Resolving a market automatically closes it, but a market can close days, weeks, or even years before it gets resolved.

### What does "PROB" mean?

Resolving a market as "PROB" means that it's resolved at a certain probability, chosen by the market creator. PROB 100% is the same as "yes", and PROB 0% is the same as "no". For example, if a market is resolved at PROB 75%, anyone who bought "yes" at less than 75% will (usually) make a profit, and anyone who bought "yes" at greater than 75% will (usually) take a loss. Vice versa for "no". This is also shown as "MKT" in the interface and API.

### What happens if a market creator resolves a market incorrectly, or doesn't resolve it at all?

Nothing. The idea is for Manifold Markets to function with similar freedom and versatility to a Twitter poll, but with more accurate results due to the dynamics of prediction markets. Individual market resolution is not enforced by the site, so if you don't trust a certain user to judge their markets fairly, you probably shouldn't participate in their markets.

That being said, manifold staff may manually send reminder emails to the creators of large markets if they have not been resolved in some time. There are also some projects in the works to enable automated market resolution after some time has passed.

### How do I tell if a certain market creator is trustworthy?

Look at their market resolution history on their profile page. If their past markets have all been resolved correctly, their future ones probably will be too. You can also look at the comments on those markets to see if any traders noticed anything suspicious. You can also ask about that person in the [Manifold Markets Discord](https://discord.gg/eHQBNBqXuh). And if their profile links to their website or social media pages, you can take that into account too.

### Are there any content filters? What happens if someone creates an inappropriate, offensive, or [dangerous](https://en.wikipedia.org/wiki/Assassination_market) market?

Right now, there are no restrictions on what markets can be created. If this becomes a problem, they may change their policies.

### Can a market creator change the close date of their market?

Yes. As long as the market hasn't been resolved yet, the creator can freely change its close date. They can even reopen a market that has already closed.

### Is there a way to see my closed markets that I need to resolve?

You'll get an automated email when they close. You can also go to your profile page and select "closed" in the dropdown menu. (This will display only markets that you haven't resolved yet.)

### When do market creators get their commission fees?

When the creator resolves their market, they get the commission from all the trades that were executed in the market.

### How do I see markets that are currently open?

You can see the top markets in various categories [here](https://manifold.markets/markets).

### Can I bet in a market I created?

Yes. However if you're doing things that the community would perceive as "shady", such as putting all your money on the correct resolution immediately before closing the market, people may be more reluctant to participate in your markets in the future. Betting "normally" in your own market is fine though.

## Miscellaneous

### How do I report bugs or ask for new features?

Contact them via [email](mailto:info@manifold.markets), post in their [Discord](https://discord.gg/eHQBNBqXuh), or create a market about that bug/feature in order to draw more attention to it and get community input.

If you don't mind putting in a little work, fork the code and open a [pull request](https://github.com/manifoldmarkets/manifold/pulls) on GitHub.

### How can I get notified of new developments?

Being a very recent project, Manifold is adding new features and tweaking existing ones quite frequently. You can keep up with changes by subscribing to their [Substack](https://manifoldmarkets.substack.com/), or joining their [Discord server](https://discord.gg/eHQBNBqXuh).

### Is there an app?

No, but the website is designed responsively and looks great on mobile.

### Does Manifold have an API for programmers?

Yep. Documentation is [here](https://docs.manifold.markets/api).

### If I have a question that isn't answered here, where can I ask it?

You can contact Manifold Markets via [email](mailto:info@manifold.markets) or post in their [Discord](https://discord.gg/eHQBNBqXuh). Once you have an answer, please consider updating this FAQ via "Edit this page" on Github!

## Credits

This FAQ was originally compiled by [Isaac King](https://outsidetheasylum.blog/manifold-markets-faq/).
