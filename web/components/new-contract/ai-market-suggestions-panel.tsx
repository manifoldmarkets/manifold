import { useState, useCallback } from 'react'
import { api } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { ExpandingInput } from '../widgets/expanding-input'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Row } from '../layout/row'
import { XIcon } from '@heroicons/react/solid'
import type { AIGeneratedMarket } from 'common/contract'
import { Content } from '../widgets/editor'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { ALL_CONTRACT_TYPES } from './create-contract-types'
import { track } from 'web/lib/service/analytics'

export function AIMarketSuggestionsPanel(props: {
  onSelectSuggestion: (suggestion: AIGeneratedMarket) => void
}) {
  const { onSelectSuggestion } = props
  const [prompt, setPrompt] = usePersistentLocalState('', 'ai-chat-prompt')
  const [markets, setMarkets] = usePersistentInMemoryState<AIGeneratedMarket[]>(
    [],
    'ai-chat-form-markets'
  )
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [creating, setCreating] = useState<number | null>(null)

  const getSuggestions = useCallback(
    async (regenerate?: boolean) => {
      if (regenerate) {
        setLoadingMore(true)
      } else {
        setLoadingSuggestions(true)
      }
      try {
        const existingTitles = regenerate ? markets.map((m) => m.question) : []
        const result = await api('generate-ai-market-suggestions', {
          prompt,
          existingTitles,
        })
        setMarkets(regenerate ? [...result, ...markets] : result)
      } catch (e) {
        console.error(e)
      }
      if (regenerate) {
        setLoadingMore(false)
      } else {
        setLoadingSuggestions(false)
      }
    },
    [prompt, markets]
  )

  const createSuggestedMarket = async (
    market: AIGeneratedMarket,
    index: number
  ) => {
    track('ai-market-suggestion-selected', {
      market: market.question,
    })
    setCreating(index)
    onSelectSuggestion(market)
    setCreating(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      getSuggestions()
    }
  }

  return (
    <Col className="gap-4">
      <Col className="gap-2">
        <Row className="relative">
          <ExpandingInput
            className="w-full"
            rows={2}
            placeholder="What are you curious about? You can paste in tweets, headlines, articles, etc."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {prompt && (
            <button
              className="text-ink-500 hover:text-ink-900 absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setPrompt('')}
              type="button"
              tabIndex={-1}
            >
              <XIcon className="h-5 w-5" />
            </button>
          )}
        </Row>
        <Button
          color="indigo"
          size="lg"
          onClick={() => getSuggestions()}
          disabled={!prompt || loadingSuggestions || loadingMore}
        >
          {loadingSuggestions ? (
            <Row className="items-center gap-2">
              <LoadingIndicator />
              <span>Hold tight, this can take 30 seconds!</span>
            </Row>
          ) : (
            'Get suggestions'
          )}
        </Button>
      </Col>

      {markets.length > 0 && (
        <Col className="gap-4">
          <Row className="items-center justify-between">
            <div className="text-ink-600 font-semibold">Suggested markets:</div>
            <Button
              color="indigo"
              size="sm"
              onClick={() => getSuggestions(true)}
              disabled={loadingMore || loadingSuggestions}
            >
              {loadingMore ? (
                <Row className="items-center gap-2">
                  <LoadingIndicator size="sm" />
                  <span>Hold tight, this can take 30 seconds!</span>
                </Row>
              ) : (
                'Generate more'
              )}
            </Button>
          </Row>
          {markets.map((market, i) => {
            return (
              <div key={i} className="rounded-lg border p-4">
                <Col className="gap-2">
                  <div className="font-semibold">{market.question}</div>
                  {market.description && (
                    <Content
                      content={market.description}
                      className="text-ink-600"
                      size="sm"
                    />
                  )}
                  <Row className="items-center justify-between">
                    <div className="text-ink-500 text-sm">
                      Closes: {new Date(market.closeDate).toLocaleDateString()}
                    </div>
                    <div className="text-ink-500 text-sm">
                      Type: {ALL_CONTRACT_TYPES[market.outcomeType]?.name}
                    </div>
                  </Row>
                  {market.reasoning && (
                    <div className="bg-primary-50 mt-2 rounded-md p-3 text-sm">
                      <div className="text-primary-800 mb-1 font-medium">
                        AI's reasoning:
                      </div>
                      <div className="text-primary-700">{market.reasoning}</div>
                    </div>
                  )}
                  <Row className="items-center justify-between">
                    <Button
                      color="gray"
                      size="sm"
                      onClick={() =>
                        setMarkets((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      Dismiss
                    </Button>
                    <Button
                      color="indigo"
                      size="sm"
                      onClick={() => createSuggestedMarket(market, i)}
                      disabled={creating === i}
                    >
                      {creating === i ? (
                        <LoadingIndicator />
                      ) : (
                        'Continue editing'
                      )}
                    </Button>
                  </Row>
                </Col>
              </div>
            )
          })}
        </Col>
      )}
    </Col>
  )
}
