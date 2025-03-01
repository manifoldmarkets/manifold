import {
  addCpmmLiquidity,
  calculateCpmmPurchase,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import { noFees } from 'common/fees'
import { formatMoney, formatPercent } from 'common/util/format'
import { floatingEqual } from 'common/util/math'
import { useState } from 'react'
import { FaExternalLinkAlt } from 'react-icons/fa'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { AmountInput } from 'web/components/widgets/amount-input'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Title } from 'web/components/widgets/title'

export default function CalculatorPage() {
  return (
    <Page trackPageView={'calculator'}>
      <SEO
        title="Manaswap Calculator"
        description="Calculate your betting odds on Manifold"
        url="/calculator"
      />
      <Calculator />
    </Page>
  )
}

function Calculator() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <Title>Maniswap Calculator</Title>
      <a
        href="https://manifoldmarkets.notion.site/Maniswap-ce406e1e897d417cbd491071ea8a0c39"
        target="_blank"
        className="text-primary-700 hover:underline"
      >
        Maniswap whitepaper <FaExternalLinkAlt className="inline h-2 w-2" />
      </a>
      <BetSimulator />
    </div>
  )
}

function BetSimulator() {
  const [poolYes, setPoolYes] = useState<number>()
  const [poolNo, setPoolNo] = useState<number>()
  const [p, setP] = useState<number>()
  const oldP = p ?? 0.5
  const [betAmount, setBetAmount] = useState<number>()
  const [outcomeType, setOutcomeType] = useState<'YES' | 'NO'>('YES')
  const [liquidity, setLiquidity] = useState<number>()

  const oldPool = { YES: poolYes ?? 0, NO: poolNo ?? 0 }
  const newBet = calculateCpmmPurchase(
    {
      pool: oldPool,
      p: oldP,
      collectedFees: noFees,
    },
    betAmount ?? 0,
    outcomeType,
    true
  )

  const oldProb = getCpmmProbability(oldPool, oldP)
  const newBetProb = getCpmmProbability(newBet.newPool, newBet.newP)
  const newProfit = newBet.shares - (betAmount ?? newBet.shares)

  const newLiquidity = addCpmmLiquidity(oldPool, oldP, liquidity ?? 0)
  const newLiquidityProb = getCpmmProbability(
    newLiquidity.newPool,
    newLiquidity.newP
  )

  return (
    <div className="mt-8">
      <h2 className="mb-4 text-xl font-semibold">Bet Simulator</h2>
      <div className="flex flex-col gap-4">
        <div className="flex flex-row justify-between gap-4">
          <div>
            <label htmlFor="poolYes">YES shares</label>
            <AmountInput
              id="poolYes"
              amount={poolYes}
              onChangeAmount={setPoolYes}
              label=""
              allowFloat
              allowNegative
              defaultValue={10}
            />{' '}
            {!!betAmount ? (
              <span className="text-ink-700 text-sm">
                After bet: {newBet.newPool.YES}
              </span>
            ) : (
              !!liquidity && (
                <span className="text-ink-700 text-sm">
                  After subsidy: {newLiquidity.newPool.YES}
                </span>
              )
            )}
          </div>
          <div>
            <label htmlFor="poolNo">NO shares</label>
            <AmountInput
              id="poolNo"
              amount={poolNo}
              onChangeAmount={setPoolNo}
              label=""
              allowFloat
              allowNegative
              defaultValue={10}
            />
            {!!betAmount ? (
              <span className="text-ink-700 text-sm">
                After bet: {newBet.newPool.NO}
              </span>
            ) : (
              !!liquidity && (
                <span className="text-ink-700 text-sm">
                  After subsidy: {newLiquidity.newPool.NO}
                </span>
              )
            )}
          </div>
          <div>
            <label htmlFor="p">p</label>
            <AmountInput
              id="p"
              amount={oldP}
              onChangeAmount={setP}
              label=""
              allowFloat
              allowNegative
              placeholder="0.5"
              defaultValue={0.5}
            />
            {!!betAmount ? (
              <span className="text-ink-700 text-sm">
                After bet: {newBet.newP}
              </span>
            ) : (
              !!liquidity && (
                <span className="text-ink-700 text-sm">
                  After subsidy: {newLiquidity.newP}
                </span>
              )
            )}
          </div>
        </div>
        <div>
          <label htmlFor="betAmount">Bet Amount</label>
          <div className="flex flex-row gap-2">
            <ChoicesToggleGroup
              currentChoice={outcomeType}
              setChoice={setOutcomeType as any}
              choicesMap={{
                YES: 'YES',
                NO: 'NO',
              }}
            />
            <AmountInput
              id="betAmount"
              amount={betAmount}
              onChangeAmount={setBetAmount}
              defaultValue={0}
              allowFloat
            />
          </div>
        </div>
        <div>
          <p>
            Probability:{' '}
            <span className="font-bold">{formatPercent(oldProb)}</span> &rarr;{' '}
            <span className="font-bold">{formatPercent(newBetProb)}</span>
          </p>
          <p>
            Shares: <span className="font-bold">{newBet.shares}</span>{' '}
            {outcomeType}
          </p>

          <p>
            Profit if correct:{' '}
            <span className="font-bold">{formatMoney(newProfit)}</span>
          </p>
        </div>
        <div className="mt-4">
          <label htmlFor="addLiquidity">Add Liquidity</label>

          <AmountInput
            id="betAmount"
            amount={liquidity}
            onChangeAmount={setLiquidity}
            defaultValue={0}
            allowFloat
            allowNegative
          />
        </div>

        {!!liquidity && !floatingEqual(newLiquidityProb, oldProb) && (
          <p className="text-scarlet-500">
            Probability:{' '}
            <span className="font-bold">{formatPercent(oldProb)}</span> &rarr;{' '}
            <span className="font-bold">{formatPercent(newLiquidityProb)}</span>
          </p>
        )}
      </div>
      <Button
        size="2xl"
        className="mt-4 w-full"
        onClick={() => {
          if (betAmount) {
            setPoolYes(newBet.newPool.YES)
            setPoolNo(newBet.newPool.NO)
            setP(newBet.newP)
            setBetAmount(0)
          } else if (liquidity) {
            setPoolYes(newLiquidity.newPool.YES)
            setPoolNo(newLiquidity.newPool.NO)
            setP(newLiquidity.newP)
            setLiquidity(0)
          }
        }}
      >
        Save
      </Button>
    </div>
  )
}
