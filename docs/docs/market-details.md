# Guide to Market Types

# Market Mechanisms

Historically, Manifold used a special type of automated market maker based on a dynamic pari-mutuel (DPM) betting
system. Free response and numeric markets still use this system. Binary markets created prior to March 15, 2022 used
this system, but all of those markets have since closed.

Binary markets created after March 15 use a constant-function market maker which holds constant the weighted geometric
mean, with weights equal to the probabilities chosen by the market creator at creation. This design was inspired by
Uniswap's CPMM and a suggestion from Manifold user Pepe. The benefit of this approach is that the payout for any bet
is fixed at purchase time - 100 shares of YES will always return M$100 if YES is chosen.

Free response markets (and the depreciated numeric markets) still use the DPM system, as they have discrete "buckets"
for the pool to be sorted into.

## Market Creation

- Users can create a market on any question they want.
- When a user creates a market, they must choose a close date, after which trading will halt.
- They must also pay a M$100 market creation fee, which is used as liquidity to subsidize trading on the market.
- The market creator will earn a commission on all bets placed in the market.
- The market creator is responsible for resolving each market in a timely manner. All fees earned as a commission will be paid out after resolution.
- Creators can also resolve N/A to cancel all transactions and reverse all transactions made on the market - this includes profits from selling shares.

# Binary Markets

## Binary Markets: Overview

- Binary markets are structured around a question with a binary outcome, such as:
  - [Will Bitcoin be worth more than $60,000 on Jan 1, 2022 at 12 am ET?](https://manifold.markets/SG/will-bitcoin-be-worth-more-than-600)
  - [Will Manifold Markets have over $1M in revenue by Jan 1st, 2023?](https://manifold.markets/ManifoldMarkets/will-mantic-markets-have-over-1m)
  - [Will we discover life on Mars before 2024?](https://manifold.markets/LarsDoucet/will-we-discover-life-on-mars-befor)
- Some binary markets are used as quasi-numeric markets, such as:
  - [How many additional subscribers will my newsletter have by the end of February?](https://manifold.markets/Nu%C3%B1oSempere/how-many-additional-subscribers-wil)
  - [How many new signups will Manifold have at the end of launch day?](https://manifold.markets/ManifoldMarkets/how-many-new-signups-will-manifold)
  - [What day will US Covid deaths peak in February?](https://manifold.markets/JamesGrugett/what-day-will-us-covid-deaths-peak)
  - These markets are made possible by the MKT option described below.

## Binary Markets: Betting & Payouts

- Traders can place a bet on either YES or NO and receive shares in the outcome in return.
- Betting on YES will increase the market’s implied probability; betting on NO will decrease the probability.
- Manifold's automated market automatically adjusts the market probability after each trade and determines how many shares a user will get for their bet.
- You can sell back your shares for cash. If you sell YES shares, the market probability will go down. If you sell NO shares, the probability will go up.
- 1 YES share = M$1 if the event happens. 1 NO share = M$1 if the event does not happen.
  - Notice that 1 YES share + 1 NO share = M$1. If you ever get multiple YES and NO shares, they will cancel out and you will be left with cash.
- When the market is resolved, you will be paid out according to your shares. If you own 100 YES shares, if the event resolves YES, you will earn M$100. (If the event resolves NO, you will earn M$0).
- The creator of each market is responsible for resolving each market. They can resolve to YES, NO, MKT, or N/A.
  - Resolving to MKT allows the creator to choose a percentage. The payout for any YES share is multiplied by this percentage, and vice versa for NO.
    - For example, if a market resolves to MKT at 30%, if you have 100 shares of YES you will receive `M$100 * 30% = M$30`.
    - In the same situation as above, if you have 100 shares of NO you will receive `M$100 * (100% - 30%) = M$70`.
    - Note that even in this instance, 1 YES share plus 1 NO share still equals M$1.

## Binary Markets: Liquidity

- The liquidity in a market is the amount of capital available for traders to trade against. The more liquidity, the greater incentive there is for traders to bet, and the more accurate the market should be.
- When a market is created, the creation fee (also called the ante or subsidy) is used to fill the liquidity pool. This happens whether the creation fee is paid by the user or by Manifold for the daily free market.
- Behind the scenes, when a bet is placed the CPMM mechanism does [a bunch of math](http://bit.ly/maniswap). The end result is that for each M$1 bet, 1 YES share and 1 NO share is created. Some amount of shares are then given to the user who made the bet, and the rest are stored in the liquidity pool.
  Due to this mechanism, the number of YES shares in the whole market always equals the number of NO shares.
- You can manually add liquidity to any market to increase the incentives for traders to participate. You can think of added liquidity as a subsidy for getting your question answered. You can do this by opening up the market info popup window located in the (...) section of the header on the market page.
  - Adding liquidity provides you with a number of YES and NO shares, which can be withdrawn from the same interface. These shares resolve to M$ like normal when the market resolves, which will return you some amount of your investment.
  - If the market moves significantly in either direction, your liquidity will become significantly less valuable. You are currently very unlikely to make money by investing liquidity in a market, it is a way to subsidize a market and encourage more people to bet, to achieve a more accurate answer.
  - Adding liquidity to a market also makes it require more capital to move the market, so if you want to subsidize a market, first make sure the market price is roughly where you think it should be.

### Algorithm

As of May 2023 the binary algorithm is referred to as "cpmm-1" in [the Manifold
source code](https://github.com/manifoldmarkets/manifold). Code explaining
how to compute how much a given bet will move a market can be found in
common/src/calculate-cpmm.ts in the Manifold repo.

A version of this calculation that omits fees
(which are zero as of May 2023) can be found in the
[mango](https://github.com/kevinburke/mango/blob/main/algorithm.go) client
library.

# Free-Response Markets

## Free-Response Markets: Overview

- Free-response markets are structured around a question with a multiple outcomes, such as:
  - [Which team will win the NBA Finals 2022?](https://manifold.markets/howtodowtle/which-team-will-win-the-nba-finals)
  - [Who will win "Top Streaming Songs Artist" at the 2022 Billboard Music Awards?](https://manifold.markets/Predictor/who-will-win-top-streaming-songs-ar)
  - [What life improvement intervention suggested would I found most useful?](https://manifold.markets/vlad/what-life-improvement-intervention)
- Some free-response markets are used as quasi-numeric markets, such as:
  - [What day will Russia invade Ukraine?](https://manifold.markets/Duncan/what-day-will-russia-invade-ukraine)
  - [What will inflation be in March?](https://manifold.markets/ManifoldMarkets/what-will-inflation-be-in-march)
  - [How many Manifold team members in the Bahamas will test positive for COVID?](https://manifold.markets/Sinclair/how-many-manifold-team-members-in-t)

## Free-Response Markets: Betting & Payouts

- Markets are structured around a list of answers, any of which can be bet on.
- When a Free Response market is created, the market creation fee goes into a hidden answer called the Ante and gets paid to the winner(s), to subsidize the market and create an incentive to bet. This happens whether the creation fee is paid by the user or by Manifold for the daily free market.
  - This hidden answer is why a market's probabilities will not add up to 100%.
  - If you want to further subsidize a market, it's customary to create an ANTE answer and put money in that.
- Anyone can add answers to a market as long as they stake some amount of M$ on it. Traders can place a bet on any answer and receive shares in the outcome in return.
- When a user places a bet, their M$ goes into the market's pool and they receive a certain amount of shares of the selected answer.
- When the market is resolved, you will be paid out according to your shares. If the creator resolves to answer #1, the entire pool is divided up amongst the users who bet on answer #1 proportional to their shares.
- The creator of each market is responsible for resolving each market. They can resolve to any single answer, or even multiple answers.
  - Resolving to multiple answers allows the creator to choose a percentage for each selected answer (or distribute equally). The payout for any answer is taken from the amount of the total pool allocated to that answer.
    - For example, let's take a free-response market with many answers. The pool for this market is $500, and you own 100 out of 500 total shares of answer #1.
    - If the creator resolves to answer #1 only, you will receive `M$500 * (100 / 500) = M$100`.
    - If the creator resolves 50% to answer #1 and 50% to answer #2, you will receive `(M$500 * 50%) * (100 / 500) = M$50`.
    - Note that your payout is dependent on the total number of shares, and thus may decrease if more people buy shares in that answer.
