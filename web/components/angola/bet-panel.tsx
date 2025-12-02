// ============================================================================
// BET PANEL COMPONENT
// ============================================================================
// Simplified betting interface for YES/NO markets
// ============================================================================

import { useState, useCallback, useMemo } from 'react'
import { AngolaMarket, BetOutcome } from 'common/types/angola-types'
import { formatAOA, getAngolaConfig } from 'common/envs/angola'
import { usePlaceBet, useMarketBetPreview } from 'web/hooks/use-angola-api'
import { useAuth } from 'web/hooks/use-angola-auth'

const config = getAngolaConfig()

type BetPanelProps = {
  market: AngolaMarket
  userBalance?: number
  onBetPlaced?: () => void
}

export function BetPanel({ market, userBalance = 0, onBetPlaced }: BetPanelProps) {
  const { isAuthenticated } = useAuth()
  const { placeBet, isLoading, error, clearError } = usePlaceBet()

  const [outcome, setOutcome] = useState<BetOutcome>('YES')
  const [amount, setAmount] = useState<string>('')
  const [showSuccess, setShowSuccess] = useState(false)

  const amountNum = parseFloat(amount) || 0
  const preview = useMarketBetPreview(market, outcome, amountNum)

  const isMarketClosed =
    market.isResolved ||
    (market.closeTime && market.closeTime < Date.now())

  const canBet = useMemo(() => {
    if (!isAuthenticated) return false
    if (isMarketClosed) return false
    if (amountNum < config.minBetAmount) return false
    if (amountNum > userBalance) return false
    return true
  }, [isAuthenticated, isMarketClosed, amountNum, userBalance])

  const handleSubmit = useCallback(async () => {
    if (!canBet) return

    clearError()
    const result = await placeBet({
      marketId: market.id,
      outcome,
      amount: amountNum,
    })

    if (result) {
      setAmount('')
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
      onBetPlaced?.()
    }
  }, [canBet, clearError, placeBet, market.id, outcome, amountNum, onBetPlaced])

  const handleAmountChange = (value: string) => {
    // Only allow numbers and decimal point
    const cleaned = value.replace(/[^\d.]/g, '')
    // Only allow one decimal point
    const parts = cleaned.split('.')
    if (parts.length > 2) return
    // Limit decimal places to 2
    if (parts[1] && parts[1].length > 2) return
    setAmount(cleaned)
  }

  const quickAmounts = [100, 500, 1000, 5000]

  if (isMarketClosed) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-center">
        <p className="text-gray-600">
          {market.isResolved
            ? `Mercado resolvido: ${market.resolution}`
            : 'Mercado fechado para apostas'}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Outcome Selection */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setOutcome('YES')}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-lg transition-all ${
            outcome === 'YES'
              ? 'bg-green-500 text-white shadow-md'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}
        >
          SIM
          <span className="block text-sm font-normal opacity-75">
            {Math.round(market.prob * 100)}%
          </span>
        </button>
        <button
          onClick={() => setOutcome('NO')}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-lg transition-all ${
            outcome === 'NO'
              ? 'bg-red-500 text-white shadow-md'
              : 'bg-red-50 text-red-700 hover:bg-red-100'
          }`}
        >
          NAO
          <span className="block text-sm font-normal opacity-75">
            {Math.round((1 - market.prob) * 100)}%
          </span>
        </button>
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Valor da aposta (Kz)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
            Kz
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.00"
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
          />
        </div>

        {/* Quick Amount Buttons */}
        <div className="flex gap-2 mt-2">
          {quickAmounts.map((quickAmount) => (
            <button
              key={quickAmount}
              onClick={() => setAmount(quickAmount.toString())}
              className="flex-1 py-1 px-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              {formatAOA(quickAmount).replace('Kz ', '')}
            </button>
          ))}
        </div>

        {/* Balance */}
        {isAuthenticated && (
          <p className="text-sm text-gray-500 mt-2">
            Saldo disponivel: {formatAOA(userBalance)}
          </p>
        )}
      </div>

      {/* Preview */}
      {amountNum > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <div className="flex justify-between mb-1">
            <span className="text-gray-600">Shares estimadas:</span>
            <span className="font-medium">{preview.shares.toFixed(2)}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-gray-600">Probabilidade apos:</span>
            <span
              className={`font-medium ${
                outcome === 'YES' ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {Math.round(preview.probAfter * 100)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Pagamento potencial:</span>
            <span className="font-medium text-green-600">
              {formatAOA(preview.potentialPayout)}
            </span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-green-50 text-green-700 rounded-lg p-3 mb-4 text-sm">
          Aposta realizada com sucesso!
        </div>
      )}

      {/* Submit Button */}
      {isAuthenticated ? (
        <button
          onClick={handleSubmit}
          disabled={!canBet || isLoading}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-lg transition-all ${
            canBet && !isLoading
              ? outcome === 'YES'
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isLoading
            ? 'Processando...'
            : amountNum > userBalance
            ? 'Saldo insuficiente'
            : amountNum < config.minBetAmount
            ? `Minimo: ${formatAOA(config.minBetAmount)}`
            : `Apostar ${outcome === 'YES' ? 'SIM' : 'NAO'}`}
        </button>
      ) : (
        <button
          onClick={() => {
            /* Navigate to login */
          }}
          className="w-full py-3 px-4 rounded-lg font-semibold text-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors"
        >
          Entrar para apostar
        </button>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 text-center mt-3">
        Ao apostar, voce concorda com os termos de uso da plataforma.
      </p>
    </div>
  )
}

// ============================================================================
// SELL PANEL COMPONENT
// ============================================================================

type SellPanelProps = {
  market: AngolaMarket
  position: {
    yesShares: number
    noShares: number
    totalInvested: number
  }
  onSold?: () => void
}

export function SellPanel({ market, position, onSold }: SellPanelProps) {
  const [outcome, setOutcome] = useState<BetOutcome>(
    position.yesShares > position.noShares ? 'YES' : 'NO'
  )
  const [amount, setAmount] = useState<string>('')

  const availableShares = outcome === 'YES' ? position.yesShares : position.noShares
  const amountNum = parseFloat(amount) || 0

  const estimatedValue = useMemo(() => {
    if (amountNum <= 0) return 0
    const effectiveProb = outcome === 'YES' ? market.prob : 1 - market.prob
    return amountNum * effectiveProb
  }, [amountNum, outcome, market.prob])

  if (market.isResolved) {
    return null
  }

  if (availableShares <= 0) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-600">
        Voce nao tem shares para vender neste mercado.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Vender Shares</h3>

      {/* Outcome Selection */}
      <div className="flex gap-2 mb-4">
        {position.yesShares > 0 && (
          <button
            onClick={() => setOutcome('YES')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              outcome === 'YES'
                ? 'bg-green-500 text-white'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            SIM ({position.yesShares.toFixed(1)} shares)
          </button>
        )}
        {position.noShares > 0 && (
          <button
            onClick={() => setOutcome('NO')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              outcome === 'NO'
                ? 'bg-red-500 text-white'
                : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            NAO ({position.noShares.toFixed(1)} shares)
          </button>
        )}
      </div>

      {/* Shares to Sell */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Quantidade de shares
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          max={availableShares}
          min={0}
          step={0.1}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={() => setAmount(availableShares.toString())}
          className="text-sm text-blue-600 hover:text-blue-700 mt-1"
        >
          Vender todas ({availableShares.toFixed(2)} shares)
        </button>
      </div>

      {/* Estimate */}
      {amountNum > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Valor estimado:</span>
            <span className="font-medium">{formatAOA(estimatedValue)}</span>
          </div>
        </div>
      )}

      <button
        disabled={amountNum <= 0 || amountNum > availableShares}
        className="w-full py-2 px-4 rounded-lg font-medium bg-gray-800 hover:bg-gray-900 text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Vender Shares
      </button>
    </div>
  )
}

export default BetPanel
