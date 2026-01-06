import { useEffect, useState, useRef } from 'react'
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
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'

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

  const user = useUser()
  const savedResultRef = useRef(false)

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

  // Track analytics when game is completed
  const trackedCompletionRef = useRef(false)
  useEffect(() => {
    // Reset trackedCompletionRef when it's a new day
    if (gameState.dateString !== dateString) {
      trackedCompletionRef.current = false
    }

    if (
      ready &&
      gameState.completed &&
      !trackedCompletionRef.current &&
      gameState.dateString === dateString
    ) {
      trackedCompletionRef.current = true
      const attemptCount = gameState.attempts[0]?.feedback.length || 0
      track('predictle completed', {
        puzzleNumber,
        attempts: attemptCount,
        won: gameState.won,
      })
    }
  }, [
    ready,
    gameState.completed,
    gameState.won,
    gameState.attempts,
    gameState.dateString,
    puzzleNumber,
    dateString,
  ])

  // Save result to database when game is completed (for logged-in users)
  useEffect(() => {
    // Reset savedResultRef when it's a new day
    if (gameState.dateString !== dateString) {
      savedResultRef.current = false
    }

    if (
      ready &&
      gameState.completed &&
      user &&
      !savedResultRef.current &&
      gameState.dateString === dateString
    ) {
      savedResultRef.current = true
      const attemptCount = gameState.attempts[0]?.feedback.length || 0
      api('save-predictle-result', {
        puzzleNumber,
        attempts: attemptCount,
        won: gameState.won,
      }).catch((e) => {
        console.error('Failed to save predictle result:', e)
        savedResultRef.current = false // Allow retry on error
      })
    }
  }, [
    ready,
    gameState.completed,
    gameState.won,
    gameState.attempts,
    gameState.dateString,
    user,
    puzzleNumber,
    dateString,
  ])

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

  const correctCount = orderedMarkets.filter((m) => isMarketLocked(m.id)).length

  return (
    <Col className="w-full max-w-xl gap-6">
      {/* Header */}
      <Col className="items-center gap-3 text-center">
        <div className="text-5xl">🔮</div>
        <h1 className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 bg-clip-text text-4xl font-black tracking-tight text-transparent">
          Predictle
        </h1>
        <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">
          Sort these markets from <span className="font-semibold">highest</span>{' '}
          to <span className="font-semibold">lowest</span> probability
        </p>

        {/* Progress dots */}
        {!gameState.completed && (
          <Row className="gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={clsx(
                  'h-3 w-3 rounded-full transition-all',
                  i <= attemptNumber
                    ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-md shadow-violet-200 dark:shadow-violet-500/50'
                    : 'bg-slate-200 dark:bg-slate-600'
                )}
              />
            ))}
          </Row>
        )}

        {/* Score indicator */}
        {attemptNumber > 0 && !gameState.completed && (
          <div className="rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 dark:ring-1 dark:ring-emerald-500/30">
            ✓ {correctCount}/5 correct
          </div>
        )}
      </Col>

      {/* Game area */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="markets">
          {(provided, snapshot) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={clsx(
                'rounded-2xl border-2 p-3 transition-all duration-200',
                snapshot.isDraggingOver
                  ? 'border-fuchsia-300 bg-fuchsia-50 shadow-lg shadow-fuchsia-100 dark:border-fuchsia-500/50 dark:bg-fuchsia-500/10 dark:shadow-fuchsia-500/20'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50'
              )}
            >
              <Col className="gap-2">
                <Row className="items-center justify-center gap-1.5 py-1 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                  <span>Higher probability</span>
                </Row>
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
                <Row className="items-center justify-center gap-1.5 py-1 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  <span>Lower probability</span>
                </Row>
              </Col>
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Submit / Results */}
      {!gameState.completed ? (
        <button
          onClick={handleSubmit}
          disabled={attemptNumber >= 4}
          className={clsx(
            'relative w-full overflow-hidden rounded-xl py-4 text-lg font-bold text-white shadow-lg transition-all',
            attemptNumber >= 4
              ? 'cursor-not-allowed bg-gray-400 dark:bg-slate-600'
              : 'bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 shadow-fuchsia-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-fuchsia-200 active:scale-[0.98] dark:shadow-fuchsia-500/30 dark:hover:shadow-fuchsia-500/40'
          )}
        >
          <span className="relative z-10">
            🎯 Submit Guess ({4 - attemptNumber} left)
          </span>
        </button>
      ) : (
        <Col className="gap-3">
          <div
            className={clsx(
              'rounded-2xl p-6 text-center shadow-lg',
              gameState.won
                ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-emerald-200 dark:from-emerald-600 dark:to-teal-600 dark:shadow-emerald-500/30'
                : 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-200 dark:from-amber-600 dark:to-orange-600 dark:shadow-amber-500/30'
            )}
          >
            <div className="mb-2 text-4xl">{gameState.won ? '🎉' : '😅'}</div>
            <div className="text-xl font-bold">
              {gameState.won
                ? attemptNumber === 1
                  ? 'Perfect!'
                  : `You got it in ${attemptNumber} tries!`
                : 'Better luck tomorrow!'}
            </div>
            {gameState.won && (
              <div className="mt-1 text-sm opacity-90">
                {attemptNumber === 1
                  ? 'Incredible! First try!'
                  : attemptNumber === 2
                  ? 'Amazing! So close to perfect!'
                  : attemptNumber === 3
                  ? 'Great job!'
                  : 'You made it!'}
              </div>
            )}
          </div>
          <ShareButton
            attempts={gameState.attempts}
            puzzleNumber={puzzleNumber}
            markets={orderedMarkets}
          />
        </Col>
      )}

      {/* Footer */}
      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Predictle #{puzzleNumber} • New puzzle daily at midnight PT
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
  const isCorrect = lastFeedback === 'correct'

  return (
    <div
      className={clsx(
        'group relative rounded-xl border-2 px-4 py-3 transition-all duration-200',
        isDragging
          ? 'scale-105 border-fuchsia-400 bg-fuchsia-50 shadow-xl shadow-fuchsia-200 dark:border-fuchsia-500 dark:bg-fuchsia-500/20 dark:shadow-fuchsia-500/30'
          : isCorrect
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500 dark:hover:bg-slate-700/80 dark:hover:shadow-none',
        !gameOver && !isLocked && 'cursor-grab active:cursor-grabbing',
        isLocked &&
          'ring-2 ring-emerald-200 dark:ring-1 dark:ring-emerald-500/50'
      )}
    >
      <Row className="items-center gap-3">
        {/* Drag handle indicator */}
        {!gameOver && !isLocked && (
          <div className="flex flex-col gap-0.5 text-slate-300 transition-colors group-hover:text-slate-400 dark:text-slate-500 dark:group-hover:text-slate-400">
            <div className="flex gap-0.5">
              <div className="h-1 w-1 rounded-full bg-current" />
              <div className="h-1 w-1 rounded-full bg-current" />
            </div>
            <div className="flex gap-0.5">
              <div className="h-1 w-1 rounded-full bg-current" />
              <div className="h-1 w-1 rounded-full bg-current" />
            </div>
            <div className="flex gap-0.5">
              <div className="h-1 w-1 rounded-full bg-current" />
              <div className="h-1 w-1 rounded-full bg-current" />
            </div>
          </div>
        )}

        <Col className="min-w-0 flex-1 gap-1">
          {gameOver ? (
            <Link
              href={contractPath({
                creatorUsername: market.creatorUsername,
                slug: market.slug,
              })}
              className={clsx(
                'line-clamp-2 text-sm font-semibold transition-colors',
                isCorrect
                  ? 'text-emerald-800 hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200'
                  : 'text-slate-800 hover:text-fuchsia-600 dark:text-slate-200 dark:hover:text-fuchsia-400'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {market.question}
            </Link>
          ) : (
            <span className="line-clamp-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {market.question}
            </span>
          )}
          {showProb && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    isCorrect
                      ? 'bg-gradient-to-r from-emerald-400 to-teal-400 dark:from-emerald-500 dark:to-teal-500'
                      : 'bg-gradient-to-r from-violet-400 to-fuchsia-400 dark:from-violet-500 dark:to-fuchsia-500'
                  )}
                  style={{ width: `${Math.round(market.prob * 100)}%` }}
                />
              </div>
              <span
                className={clsx(
                  'text-xs font-bold',
                  isCorrect
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-fuchsia-600 dark:text-fuchsia-400'
                )}
              >
                {Math.round(market.prob * 100)}%
              </span>
            </div>
          )}
        </Col>

        {/* Feedback emojis */}
        <Col className="flex-shrink-0 items-end gap-1">
          {feedback.length > 0 && (
            <Row className="gap-1 text-xl">
              {feedback.map((f, i) => (
                <span
                  key={i}
                  className={clsx(
                    'transition-transform',
                    i === feedback.length - 1 && 'animate-bounce'
                  )}
                  style={{
                    animationDuration: '0.5s',
                    animationIterationCount: 1,
                  }}
                >
                  {getFeedbackEmoji(f)}
                </span>
              ))}
            </Row>
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
    <button
      onClick={handleShare}
      className={clsx(
        'w-full rounded-xl border-2 py-3 font-bold transition-all',
        copied
          ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-500/50 dark:bg-emerald-500/20 dark:text-emerald-400'
          : 'border-violet-200 bg-violet-50 text-violet-600 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-500/50 dark:bg-violet-500/20 dark:text-violet-400 dark:hover:border-violet-400 dark:hover:bg-violet-500/30'
      )}
    >
      {copied ? '✓ Copied to clipboard!' : '📋 Share results'}
    </button>
  )
}

export default function PredictlePage() {
  const { data, loading } = useAPIGetter('get-predictle-markets', {})

  return (
    <Page trackPageView="predictle" hideFooter className="!bg-transparent">
      <SEO
        title="Predictle"
        description="A daily game where you arrange prediction markets by probability. Can you guess the order?"
        url="/predictle"
      />
      {/* Light mode gradient background */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-50 dark:hidden" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-200/30 via-transparent to-transparent dark:hidden" />
      {/* Dark mode gradient background */}
      <div className="fixed inset-0 -z-10 hidden bg-slate-900 dark:block" />
      <div className="fixed inset-0 -z-10 hidden bg-gradient-to-br from-violet-900/30 via-slate-900 to-fuchsia-900/20 dark:block" />
      <div className="fixed inset-0 -z-10 hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-800/20 via-transparent to-transparent dark:block" />

      <Col className="mx-auto w-full max-w-xl px-4 py-8">
        {loading || !data ? (
          <Col className="items-center gap-4 py-12">
            <div className="text-5xl">🔮</div>
            <LoadingIndicator />
            <p className="text-slate-500 dark:text-slate-400">
              Loading today's puzzle...
            </p>
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
