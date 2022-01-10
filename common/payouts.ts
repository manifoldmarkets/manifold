import { Bet } from "./bet";
import { Contract } from "./contract";
import { CREATOR_FEE, FEES } from "./fees";

export const getCancelPayouts = (truePool: number, bets: Bet[]) => {
  console.log("resolved N/A, pool M$", truePool);

  const betSum = sumBy(bets, (b) => b.amount);

  return bets.map((bet) => ({
    userId: bet.userId,
    payout: (bet.amount / betSum) * truePool,
  }));
};

export const getStandardPayouts = (
  outcome: string,
  truePool: number,
  contract: Contract,
  bets: Bet[]
) => {
  const [yesBets, noBets] = partition(bets, (bet) => bet.outcome === "YES");
  const winningBets = outcome === "YES" ? yesBets : noBets;

  const betSum = sumBy(winningBets, (b) => b.amount);

  if (betSum >= truePool) return getCancelPayouts(truePool, winningBets);

  const creatorPayout = CREATOR_FEE * truePool;
  console.log(
    "resolved",
    outcome,
    "pool: M$",
    truePool,
    "creator fee: M$",
    creatorPayout
  );

  const shareDifferenceSum = sumBy(winningBets, (b) => b.shares - b.amount);

  const winningsPool = truePool - betSum;

  const winnerPayouts = winningBets.map((bet) => ({
    userId: bet.userId,
    payout:
      (1 - FEES) *
      (bet.amount +
        ((bet.shares - bet.amount) / shareDifferenceSum) * winningsPool),
  }));

  return winnerPayouts.concat([
    { userId: contract.creatorId, payout: creatorPayout },
  ]); // add creator fee
};

export const getMktPayouts = (
  truePool: number,
  contract: Contract,
  bets: Bet[]
) => {
  const p =
    contract.pool.YES ** 2 / (contract.pool.YES ** 2 + contract.pool.NO ** 2);
  console.log("Resolved MKT at p=", p, "pool: $M", truePool);

  const [yesBets, noBets] = partition(bets, (bet) => bet.outcome === "YES");

  const weightedBetTotal =
    p * sumBy(yesBets, (b) => b.amount) +
    (1 - p) * sumBy(noBets, (b) => b.amount);

  if (weightedBetTotal >= truePool) {
    return bets.map((bet) => ({
      userId: bet.userId,
      payout:
        (((bet.outcome === "YES" ? p : 1 - p) * bet.amount) /
          weightedBetTotal) *
        truePool,
    }));
  }

  const winningsPool = truePool - weightedBetTotal;

  const weightedShareTotal =
    p * sumBy(yesBets, (b) => b.shares - b.amount) +
    (1 - p) * sumBy(noBets, (b) => b.shares - b.amount);

  const yesPayouts = yesBets.map((bet) => ({
    userId: bet.userId,
    payout:
      (1 - FEES) *
      (p * bet.amount +
        ((p * (bet.shares - bet.amount)) / weightedShareTotal) * winningsPool),
  }));

  const noPayouts = noBets.map((bet) => ({
    userId: bet.userId,
    payout:
      (1 - FEES) *
      ((1 - p) * bet.amount +
        (((1 - p) * (bet.shares - bet.amount)) / weightedShareTotal) *
          winningsPool),
  }));

  const creatorPayout = CREATOR_FEE * truePool;

  return [
    ...yesPayouts,
    ...noPayouts,
    { userId: contract.creatorId, payout: creatorPayout },
  ];
};

const partition = <T>(array: T[], f: (t: T) => boolean) => {
  const yes = [];
  const no = [];

  for (let t of array) {
    if (f(t)) yes.push(t);
    else no.push(t);
  }

  return [yes, no] as [T[], T[]];
};

const sumBy = <T>(array: T[], f: (t: T) => number) => {
  const values = array.map(f);
  return values.reduce((prev, cur) => prev + cur, 0);
};
