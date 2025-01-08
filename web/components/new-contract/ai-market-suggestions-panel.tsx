import { useState, useCallback } from 'react'
import { api, APIError } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { ExpandingInput } from '../widgets/expanding-input'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Row } from '../layout/row'
import { XIcon } from '@heroicons/react/solid'
import type { AIGeneratedMarket } from 'common/contract'
import { Content } from '../widgets/editor'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { ALL_CONTRACT_TYPES } from './create-contract-types'
import { track } from 'web/lib/service/analytics'
import { toast } from 'react-hot-toast'

export function AIMarketSuggestionsPanel(props: {
  onSelectSuggestion: (suggestion: AIGeneratedMarket) => void
}) {
  const { onSelectSuggestion } = props
  const [prompt, setPrompt] = usePersistentLocalState(
    '',
    'ai-market-suggestions-prompt'
  )
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = usePersistentLocalState(
    '',
    'ai-market-suggestions-last-generated-prompt'
  )
  const [markets, setMarkets] = usePersistentInMemoryState<AIGeneratedMarket[]>(
    [],
    'ai-market-suggestions-markets'
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
        setLastGeneratedPrompt(prompt)
      }
      try {
        const existingTitles = regenerate ? markets.map((m) => m.question) : []
        const [result1, result2] = await Promise.all([
          api('generate-ai-market-suggestions', {
            prompt,
            existingTitles,
          }),
          api('generate-ai-market-suggestions-2', {
            prompt,
            existingTitles,
          }),
        ])

        const combinedResults = [...result1, ...result2].sort(
          () => Math.random() - 0.5
        )

        setMarkets(
          regenerate ? [...combinedResults, ...markets] : combinedResults
        )
      } catch (e) {
        if (e instanceof APIError) {
          toast.error(e.message)
        } else {
          console.error(e)
        }
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
      promptVersion: market.promptVersion,
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
          onClick={() => getSuggestions(prompt === lastGeneratedPrompt)}
          disabled={!prompt || loadingSuggestions || loadingMore}
        >
          {loadingSuggestions || loadingMore ? (
            <Row className="items-center gap-2">
              <LoadingIndicator />
              <span>Hang on, this can take up to a minute!</span>
            </Row>
          ) : prompt === lastGeneratedPrompt ? (
            'Generate more'
          ) : (
            'Get suggestions'
          )}
        </Button>
      </Col>

      {markets.length > 0 && (
        <Col className="gap-4">
          <Row className="items-center justify-between">
            <div className="text-ink-600 font-semibold">Suggested markets:</div>
          </Row>
          <MarketList
            markets={markets}
            setMarkets={setMarkets}
            creating={creating}
            createSuggestedMarket={createSuggestedMarket}
          />
        </Col>
      )}
    </Col>
  )
}

type MarketListProps = {
  markets: AIGeneratedMarket[]
  setMarkets: (markets: AIGeneratedMarket[]) => void
  creating: number | null
  createSuggestedMarket: (market: AIGeneratedMarket, index: number) => void
}

const MarketList = ({
  markets,
  setMarkets,
  creating,
  createSuggestedMarket,
}: MarketListProps) => (
  <Col className="gap-4">
    {markets.map((market, i) => (
      <div key={i} className="rounded-lg border p-4">
        <Col className="relative gap-2">
          <div className="font-semibold">{market.question}</div>
          <span className="text-ink-500 absolute -right-2 -top-2.5 text-xs">
            v{market.promptVersion}
          </span>
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
              onClick={() => setMarkets(markets.filter((_, j) => j !== i))}
            >
              Dismiss
            </Button>
            <Button
              color="indigo"
              size="sm"
              onClick={() => createSuggestedMarket(market, i)}
              disabled={creating === i}
            >
              {creating === i ? <LoadingIndicator /> : 'Continue editing'}
            </Button>
          </Row>
        </Col>
      </div>
    ))}
  </Col>
)
