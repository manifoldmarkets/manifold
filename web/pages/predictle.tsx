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
  attempts: { marketId: string; feedback: ('correct' | 'incorrect')[] }[]
  completed: boolean
  won: boolean
}

type Feedback = 'correct' | 'incorrect'

function getFeedbackEmoji(feedback: Feedback): string {
  return feedback === 'correct' ? '✅' : '❌'
}

function PredicteGame(props: {
  markets: Market[]
  correctOrder: Record<string, number>
  dateString: string
  puzzleNumber: number
}) {
  const {
    markets: apiMarkets,
    correctOrder: apiCorrectOrder,
    dateString,
    puzzleNumber,
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
    }
  }, [ready, gameState.dateString, dateString, gameState.markets])

  // Check if a market is locked (correctly guessed)
  const isMarketLocked = (marketId: string): boolean => {
    const feedback = gameState.attempts.find(
      (a) => a.marketId === marketId
    )?.feedback
    return feedback?.[feedback.length - 1] === 'correct'
  }

  const handleDragEnd = (result: any) => {
    if (!result.destination || gameState.completed) return

    const sourceIndex = result.source.index
    const destIndex = result.destination.index

    // Don't allow dragging locked markets (also handled by isDragDisabled)
    const sourceMarket = orderedMarkets[sourceIndex]
    if (isMarketLocked(sourceMarket.id)) return

    // Get unlocked positions and markets
    const unlockedIndices: number[] = []
    const unlockedMarkets: Market[] = []
    orderedMarkets.forEach((market, idx) => {
      if (!isMarketLocked(market.id)) {
        unlockedIndices.push(idx)
        unlockedMarkets.push(market)
      }
    })

    // Find where source is in the unlocked list
    const sourceUnlockedIdx = unlockedIndices.indexOf(sourceIndex)
    if (sourceUnlockedIdx === -1) return

    // Find the target unlocked index based on destination
    // If dropping on a locked position, find nearest unlocked slot
    let targetUnlockedIdx: number
    if (unlockedIndices.includes(destIndex)) {
      targetUnlockedIdx = unlockedIndices.indexOf(destIndex)
    } else {
      // Find the nearest unlocked index to destIndex
      let nearest = 0
      let minDist = Math.abs(unlockedIndices[0] - destIndex)
      for (let i = 1; i < unlockedIndices.length; i++) {
        const dist = Math.abs(unlockedIndices[i] - destIndex)
        if (dist < minDist) {
          minDist = dist
          nearest = i
        }
      }
      targetUnlockedIdx = nearest
    }

    if (sourceUnlockedIdx === targetUnlockedIdx) return

    // Reorder the unlocked markets
    const [movedMarket] = unlockedMarkets.splice(sourceUnlockedIdx, 1)
    unlockedMarkets.splice(targetUnlockedIdx, 0, movedMarket)

    // Rebuild the full array with locked markets in their fixed positions
    const newOrder = [...orderedMarkets]
    let unlockedIdx = 0
    for (let i = 0; i < newOrder.length; i++) {
      if (!isMarketLocked(orderedMarkets[i].id)) {
        newOrder[i] = unlockedMarkets[unlockedIdx++]
      }
    }

    setOrderedMarkets(newOrder)
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

        const newFeedback: Feedback =
          currentPosition === correctPosition ? 'correct' : 'incorrect'

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
          <p className="text-ink-500 text-sm">Attempt {attemptNumber}/4</p>
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
                <div className="text-ink-400 flex items-center gap-1 px-3 text-xs font-medium uppercase tracking-wider">
                  <span>↑</span>
                  <span>High probability</span>
                </div>
                {orderedMarkets.map((market, index) => (
                  <Draggable
                    key={market.id}
                    draggableId={market.id}
                    index={index}
                    isDragDisabled={
                      gameState.completed || isMarketLocked(market.id)
                    }
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                      >
                        <MarketCard
                          market={market}
                          feedback={getMarketFeedback(market.id)}
                          isDragging={snapshot.isDragging}
                          showProb={gameState.completed}
                          gameOver={gameState.completed}
                          isLocked={isMarketLocked(market.id)}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                <div className="text-ink-400 flex items-center gap-1 px-3 text-xs font-medium uppercase tracking-wider">
                  <span>↓</span>
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
        <Col className="gap-3">
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
          <ShareButton
            attempts={gameState.attempts}
            puzzleNumber={puzzleNumber}
            markets={orderedMarkets}
          />
        </Col>
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
  feedback: Feedback[]
  isDragging: boolean
  showProb: boolean
  gameOver: boolean
  isLocked: boolean
}) {
  const { market, feedback, isDragging, showProb, gameOver, isLocked } = props
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
        !gameOver && !isLocked && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <Row className="items-center gap-3">
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

function ShareButton(props: {
  attempts: { marketId: string; feedback: Feedback[] }[]
  puzzleNumber: number
  markets: Market[]
}) {
  const { attempts, puzzleNumber, markets } = props
  const [copied, setCopied] = useState(false)

  const generateShareText = () => {
    // Build feedback lines in the order of markets displayed
    const feedbackLines = markets.map((market) => {
      const marketAttempt = attempts.find((a) => a.marketId === market.id)
      if (!marketAttempt) return ''
      return marketAttempt.feedback.map(getFeedbackEmoji).join('')
    })

    return `Predictle #${puzzleNumber}
${feedbackLines.join('\n')}

Play at https://manifold.markets/predictle`
  }

  const handleShare = async () => {
    const text = generateShareText()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button onClick={handleShare} color="indigo-outline" className="w-full">
      {copied ? 'Copied!' : 'Share results'}
    </Button>
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
            puzzleNumber={data.puzzleNumber}
          />
        )}
      </Col>
    </Page>
  )
}
