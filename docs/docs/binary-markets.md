# Guide to YES/NO markets

# Overview

Historically, Manifold used a special type of automated market maker based on a dynamic pari-mutuel (DPM) betting
system. Free response and numeric markets still use this system. Binary markets created prior to March 15, 2022 used
this system, all of which have since closed.

Binary markets created after March 15 use a constant-function market maker which holds constant the weighted geometric
mean, with weights equal to the probabilities chosen by the market creator at creation. This design was inspired by
Uniswap's CPMM and a suggestion from Manifold user Pepe.

The benefit of this approach is that the payout for any bet is fixed at purchase time - 100 shares of YES will always
return M$100 if YES is chosen.

# Basic facts

- Markets are structured around a question with a binary outcome.
- Traders can place a bet on either YES or NO and receive shares in the outcome in return.
- 1 YES share = M$1 if the event happens. 1 NO share = M$1 if the event does not happen.
  - Notice that 1 YES share + 1 NO share = M$1. If you ever get multiple YES and NO shares, they will cancel out and you will be left with cash.
- When the market is resolved, you will be paid out according to your shares. If you own 100 YES shares, if the event resolves YES, you will earn M$100. (If the event resolves NO, you will earn M$0).
- The creator of each market is responsible for resolving each market. They can resolve to YES, NO, or MKT.
  - Resolving to MKT allows the creator to choose a percentage. The payout for any YES share is multiplied by this percentage, and vice versa for NO.
    - For example, if a market resolves to MKT at 30%, if you have 100 shares of YES you will receive `M$100 * 30% = M$30`.
    - In the same situation as above, if you have 100 shares of NO you will receive `M$100 * (100% - 30%) = M$70`.
    - Note that even in this instance, 1 YES share plus 1 NO share still equals M$1.
  - Creators can also resolve N/A to cancel all transactions and reverse all transactions made on the market - this includes profits from selling shares.

# Market creation

- Users can create a market on any question they want.
- When you create a market, you must choose a close date (after which trading will halt).
- You must also pay a M$100 market creation fee, which is used as liquidity to subsidize trading on your market.
  - The creation fee for the first market you create each day is provided by Manifold. Your market will still start with M$100, and you can add more liquidity later if you wish.
- You will earn a commission on all bets placed in your market.
- You are responsible for resolving your market in a timely manner. All the fees you earned as a commission will be paid out after resolution.

# Betting

- Betting on YES will increase the market’s implied probability; betting on NO will decrease the probability.
- Manifold's automated market automatically adjusts the market probability after each trade and determines how many shares a user will get for their bet.
- You can sell back your shares for cash. If you sell YES shares, the market probability will go down. If you sell NO shares, the probability will go up.
- Manifold charges fees on each trade. They are automatically calculated and baked into the number of shares you receive when you place a bet.
  - Our CPMM fee schedule is currently: `10% * (1 - post-bet probability) * bet amount`
    - The post-bet probability is what the market probability would be after your bet if there were no fees.
    - Example:
      - If you bet M$100 on NO and the resulting probability without fees would be 10%, then you pay `M$100 * 10% * 10% = M$1.0`.
      - If you bet M$100 on YES and the resulting probability without fees would be 50%, then you pay `M$100 * 10% * 50% = M$5.0`.
    - 100% of this fee is used to provide a commission to the market creator, which is paid out after the market is resolved.
  - No fees are levied on sales.

# Liquidity

- The liquidity in a market is the amount of capital available for traders to trade against.
- The more liquidity, the greater incentive there is for traders to bet, the more accurate the market will be.
- You can add liquidity to a market you are interested in to increase the incentives for traders to participate. You can think of added liquidity as a subsidy for getting your question answered.
- You can add liquidity to any market by opening up the market info popup window located in the (...) section of the header on the market page.
  - Adding liquidity provides you with a number of YES and NO shares, which can be withdrawn from the same interface. 
  - These shares resolve to M$ like normal when the market resolves, which will return you some amount of your investment. It is often wise to inject liquidity if you believe the current probability is very close to the real probability.
