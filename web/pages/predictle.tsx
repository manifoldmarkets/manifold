import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import clsx from 'clsx'

import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { Button } from 'web/components/buttons/button'
import { contractPath } from 'common/contract'
import Link from 'next/link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

type Market = {
  id: string
  question: string
  slug: string
  creatorUsername: string
  prob: number
}

type GameState = {
  dateString: string
  markets: Market[]
  correctOrder: Record<string, number>
  attempts: { marketId: string; feedback: ('up' | 'down' | 'correct')[] }[]
  completed: boolean
  won: boolean
}

type Feedback = 'up' | 'down' | 'correct'

function getFeedbackEmoji(feedback: Feedback): string {
  switch (feedback) {
    case 'up':
      return '⬆️'
    case 'down':
      return '⬇️'
    case 'correct':
      return '✅'
  }
}

function PredicteGame(props: {
  markets: Market[]
  correctOrder: Record<string, number>
  dateString: string
}) {
  const {
    markets: apiMarkets,
    correctOrder: apiCorrectOrder,
    dateString,
  } = props

  const [gameState, setGameState, ready] = usePersistentLocalState<GameState>(
    {
      dateString: '',
      markets: [],
      correctOrder: {},
      attempts: [],
      completed: false,
      won: false,
    },
    'predictle-game-state'
  )

  // Use stored markets if they exist for today, otherwise use API markets
  const markets =
    gameState.dateString === dateString && gameState.markets?.length > 0
      ? gameState.markets
      : apiMarkets
  const correctOrder =
    gameState.dateString === dateString &&
    gameState.correctOrder &&
    Object.keys(gameState.correctOrder).length > 0
      ? gameState.correctOrder
      : apiCorrectOrder

  // Current order of markets (user-arranged)
  const [orderedMarkets, setOrderedMarkets] = useState<Market[]>(markets)

  // Display indices - only update after submit, not during drag
  const [displayIndices, setDisplayIndices] = useState<Record<string, number>>(
    () => {
      const indices: Record<string, number> = {}
      markets.forEach((m, i) => {
        indices[m.id] = i + 1
      })
      return indices
    }
  )

  // Initialize or reset game for new day, or migrate old data
  useEffect(() => {
    if (!ready) return

    const isNewDay = gameState.dateString !== dateString
    const hasFeedbackButNoMarkets =
      gameState.attempts?.length > 0 && !gameState.markets?.length

    if (isNewDay || hasFeedbackButNoMarkets) {
      // New day or old data format - reset with fresh markets from API
      setGameState({
        dateString,
        markets: apiMarkets,
        correctOrder: apiCorrectOrder,
        attempts: [],
        completed: false,
        won: false,
      })
      setOrderedMarkets(apiMarkets)
      // Reset display indices
      const indices: Record<string, number> = {}
      apiMarkets.forEach((m, i) => {
        indices[m.id] = i + 1
      })
      setDisplayIndices(indices)
    }
  }, [
    ready,
    gameState.dateString,
    gameState.attempts,
    gameState.markets,
    dateString,
    apiMarkets,
    apiCorrectOrder,
  ])

  // Sync markets on load - use stored markets (keep user's order)
  useEffect(() => {
    if (
      ready &&
      gameState.dateString === dateString &&
      gameState.markets?.length > 0
    ) {
      setOrderedMarkets(gameState.markets)
      // Sync display indices with stored order
      const indices: Record<string, number> = {}
      gameState.markets.forEach((m, i) => {
        indices[m.id] = i + 1
      })
      setDisplayIndices(indices)
    }
  }, [ready, gameState.dateString, dateString, gameState.markets])

  const handleDragEnd = (result: any) => {
    if (!result.destination || gameState.completed) return

    const items = Array.from(orderedMarkets)
    const [reorderedItem] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reorderedItem)
    setOrderedMarkets(items)
  }

  const handleSubmit = () => {
    if (gameState.completed) return

    // Calculate feedback for each market
    const feedback: { marketId: string; feedback: Feedback[] }[] =
      orderedMarkets.map((market, index) => {
        const currentPosition = index + 1
        const correctPosition = correctOrder[market.id]

        // Get previous attempts for this market
        const previousFeedback =
          gameState.attempts.find((a) => a.marketId === market.id)?.feedback ||
          []

        let newFeedback: Feedback
        if (currentPosition === correctPosition) {
          newFeedback = 'correct'
        } else if (currentPosition > correctPosition) {
          // Market should be earlier in list (higher prob), so needs to go up
          newFeedback = 'up'
        } else {
          // Market should be later in list (lower prob), so needs to go down
          newFeedback = 'down'
        }

        return {
          marketId: market.id,
          feedback: [...previousFeedback, newFeedback],
        }
      })

    // Check if all correct
    const allCorrect = feedback.every(
      (f) => f.feedback[f.feedback.length - 1] === 'correct'
    )

    // Check attempt count from the new feedback (not the old attempts array length)
    const newAttemptCount = feedback[0].feedback.length

    setGameState({
      dateString,
      markets: orderedMarkets, // Save user's current order
      correctOrder,
      attempts: feedback,
      completed: allCorrect || newAttemptCount >= 4,
      won: allCorrect,
    })

    // Update display indices to reflect new positions after submit
    const newIndices: Record<string, number> = {}
    orderedMarkets.forEach((m, i) => {
      newIndices[m.id] = i + 1
    })
    setDisplayIndices(newIndices)
  }

  const getMarketFeedback = (marketId: string): Feedback[] => {
    return (
      gameState.attempts.find((a) => a.marketId === marketId)?.feedback || []
    )
  }

  const attemptNumber = gameState.attempts.length
    ? gameState.attempts[0].feedback.length
    : 0

  if (!ready) {
    return <LoadingIndicator />
  }

  return (
    <Col className="w-full max-w-xl gap-6">
      <Col className="gap-2">
        <h1 className="text-primary-700 text-3xl font-bold tracking-tight">
          Predictle
        </h1>
        <p className="text-ink-600 text-sm">
          Arrange these markets from highest to lowest probability. Drag to
          reorder, then submit to check your answer.
        </p>
        {attemptNumber > 0 && !gameState.completed && (
          <p className="text-ink-500 text-sm">
            Attempt {attemptNumber}/4 •{' '}
            <span className="text-ink-600">
              ⬆️ = higher probability, ⬇️ = lower probability
            </span>
          </p>
        )}
      </Col>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="markets">
          {(provided, snapshot) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={clsx(
                'rounded-xl border-2 border-dashed p-2 transition-colors',
                snapshot.isDraggingOver
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-ink-200 bg-canvas-50'
              )}
            >
              <Col className="gap-2">
                <div className="text-ink-400 flex justify-between px-3 text-xs font-medium uppercase tracking-wider">
                  <span>High probability</span>
                </div>
                {orderedMarkets.map((market, index) => (
                  <Draggable
                    key={market.id}
                    draggableId={market.id}
                    index={index}
                    isDragDisabled={gameState.completed}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                      >
                        <MarketCard
                          market={market}
                          displayIndex={displayIndices[market.id] ?? index + 1}
                          feedback={getMarketFeedback(market.id)}
                          isDragging={snapshot.isDragging}
                          showProb={gameState.completed}
                          gameOver={gameState.completed}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                <div className="text-ink-400 flex justify-between px-3 text-xs font-medium uppercase tracking-wider">
                  <span>Low probability</span>
                </div>
              </Col>
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {!gameState.completed ? (
        <Button
          onClick={handleSubmit}
          size="xl"
          color="indigo"
          disabled={attemptNumber >= 4}
        >
          Submit ({4 - attemptNumber} attempts remaining)
        </Button>
      ) : (
        <div
          className={clsx(
            'rounded-lg p-4 text-center text-lg font-semibold',
            gameState.won
              ? 'bg-teal-100 text-teal-800'
              : 'bg-amber-100 text-amber-800'
          )}
        >
          {gameState.won
            ? `🎉 You got it in ${attemptNumber} ${
                attemptNumber === 1 ? 'try' : 'tries'
              }!`
            : `Game over! Better luck tomorrow.`}
        </div>
      )}

      <p className="text-ink-400 text-center text-xs">
        Come back tomorrow for a new puzzle! Markets update with current
        probabilities.
      </p>
    </Col>
  )
}

function MarketCard(props: {
  market: Market
  displayIndex: number
  feedback: Feedback[]
  isDragging: boolean
  showProb: boolean
  gameOver: boolean
}) {
  const { market, displayIndex, feedback, isDragging, showProb, gameOver } =
    props
  const lastFeedback = feedback[feedback.length - 1]

  return (
    <div
      className={clsx(
        'bg-canvas-0 group relative rounded-lg border px-4 py-3 shadow-sm transition-all',
        isDragging
          ? 'border-primary-500 ring-primary-200 shadow-lg ring-2'
          : lastFeedback === 'correct'
          ? 'border-teal-400 bg-teal-50'
          : 'border-ink-200 hover:border-ink-300',
        !gameOver && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <Row className="items-center gap-3">
        <div
          className={clsx(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold',
            lastFeedback === 'correct'
              ? 'bg-teal-500 text-white'
              : 'bg-ink-100 text-ink-600'
          )}
        >
          {displayIndex}
        </div>
        <Col className="min-w-0 flex-1 gap-0.5">
          {gameOver ? (
            <Link
              href={contractPath({
                creatorUsername: market.creatorUsername,
                slug: market.slug,
              })}
              className="text-ink-900 hover:text-primary-700 line-clamp-2 text-sm font-medium transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {market.question}
            </Link>
          ) : (
            <span className="text-ink-900 line-clamp-2 text-sm font-medium">
              {market.question}
            </span>
          )}
          {showProb && (
            <span className="text-ink-500 text-xs">
              {Math.round(market.prob * 100)}% probability
            </span>
          )}
        </Col>
        <Col className="flex-shrink-0 items-end gap-1">
          {feedback.length > 0 && (
            <Row className="gap-0.5 text-lg">
              {feedback.map((f, i) => (
                <span key={i}>{getFeedbackEmoji(f)}</span>
              ))}
            </Row>
          )}
          {!isDragging && feedback.length === 0 && (
            <span className="text-ink-300 text-xl">⋮⋮</span>
          )}
        </Col>
      </Row>
    </div>
  )
}

export default function PredictlePage() {
  const { data, loading } = useAPIGetter('get-predictle-markets', {})

  return (
    <Page trackPageView="predictle">
      <SEO
        title="Predictle"
        description="A daily game where you arrange prediction markets by probability. Can you guess the order?"
        url="/predictle"
      />
      <Col className="mx-auto w-full max-w-xl px-4 py-6">
        {loading || !data ? (
          <Col className="items-center gap-4 py-12">
            <LoadingIndicator />
            <p className="text-ink-500">Loading today's markets...</p>
          </Col>
        ) : (
          <PredicteGame
            markets={data.markets}
            correctOrder={data.correctOrder}
            dateString={data.dateString}
          />
        )}
      </Col>
    </Page>
  )
}
