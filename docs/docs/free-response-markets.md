# Guide to Free Response markets

# Overview

In free-response markets, the creator asks an open ended question. Both the creator and users can propose answers which can be bet on. The payout system rewards users who bet on good answers early.

# Basic facts

- Markets are structured around a list of answers, any of which can be bet on.
- Anyone can add answers to a market as long as they stake some amount of M$ on it.
- Traders can place a bet on any answer and receive shares in the outcome in return.
- When a user places a bet, their M$ goes into the pool and they receive a certain amount of shares of the selected answer.
- When the market is resolved, you will be paid out according to your shares. If you own shares of answer #1, and the creator resolves to answer #1, the entire pool is divided up amongst the users who bet on answer #1 proportional to their shares.
- The creator of each market is responsible for resolving each market. They can resolve to any single answer, or even multiple answers.
  - Resolving to multiple answers allows the creator to choose a percentage for each selected answer (or distribute equally). The payout for any answer is taken from the amount of the total pool allocated to that answer.
    - For example, let's take a free-response market with many answers. The pool for this market is $500, and you own 100 out of 500 total shares of answer #1.
    - If the creator resolves to answer #1 only, you will receive `M$500 * (100 / 500) = M$100`.
    - If the creator resolves 50% to answer #1 and 50% to answer #2, you will receive `(M$500 * 50%) * (100 / 500) = M$50`.
    - Note that your payout is dependent on the total number of shares, and thus may decrease if more people buy shares in that answer.
  - Creators can also resolve N/A to cancel all transactions and reverse all transactions made on the market - this includes profits from selling shares.

# Market creation

- Users can create a market on any question they want.
- When you create a market, you must choose a close date (after which trading will halt).
- You must also pay a M$100 market creation fee, which is used as liquidity to subsidize trading on your market.
  - The creation fee for the first market you create each day is provided by Manifold. Your market will still start with M$100, and you can add more liquidity later if you wish.
- The market creator's ante goes into a "none of the above" pseudo-option that can't be bet on and can't be chosen as a correct answer when the market is resolved.
- You will earn a commission on all bets placed in your market.
- You are responsible for resolving your market in a timely manner. All the fees you earned as a commission will be paid out after resolution.

# Betting

- Betting on any answer will increase that answer's implied probability; selling a share will decrease the probability.
- Manifold's automated market automatically adjusts each answer's probability after each trade and determines how many shares a user will get for their bet.
- You can sell back your shares for cash, decreasing the probability of that answer. If you sell the last share of an answer, the probability of that answer drops to 0 (but can still be bet on).
- Manifold charges fees on each trade. They are automatically calculated and baked into the number of shares you receive when you place a bet.
  - Our DPM fee schedule is currently: `5% * (1 - post-bet probability) * bet amount`
    - The post-bet probability is what the market probability would be after your bet if there were no fees.
    - 4% is used to provide a commission to the market creator, which is paid out after the market is resolved. 1% is "burnt" to prevent inflation.
  - No fees are levied on sales.
