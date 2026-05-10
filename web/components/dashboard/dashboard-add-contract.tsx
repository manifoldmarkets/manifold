import { SelectMarkets } from '../contract-select-modal'
import { DashboardQuestionItem } from 'common/dashboard'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { api } from 'web/lib/api/api'
import toast from 'react-hot-toast'

export function DashboardAddContract(props: {
  addQuestions: (questions: DashboardQuestionItem[]) => void
}) {
  const { addQuestions } = props
  const [bulkText, setBulkText] = useState('')
  const [createText, setCreateText] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  return (
    <div className="flex grow flex-col gap-4 overflow-y-auto">
      <SelectMarkets
        className="min-h-[280px] grow overflow-y-auto"
        submitLabel={(len) => `Add ${len} question${len !== 1 ? 's' : ''}`}
        onSubmit={(contracts) => {
          addQuestions(
            contracts.map((contract) => {
              return { type: 'question', slug: contract.slug }
            })
          )
        }}
      />

      <BulkAddSection
        title="Bulk add existing markets"
        description="Paste market URLs or slugs, one per line."
        value={bulkText}
        setValue={setBulkText}
        placeholder={
          'will-spacex-launch-starship-this-month\nhttps://manifold.markets/user/market-slug'
        }
        submitLabel="Add pasted markets"
        onSubmit={() => {
          const slugs = bulkText
            .split('\n')
            .map(parseMarketSlug)
            .filter((slug): slug is string => !!slug)
          if (slugs.length === 0) {
            toast.error('Paste at least one market URL or slug.')
            return
          }
          addQuestions(slugs.map((slug) => ({ type: 'question', slug })))
        }}
      />

      <BulkAddSection
        title="Create binary markets"
        description="One row per market. Add an optional starting probability after a comma, tab, or pipe."
        value={createText}
        setValue={setCreateText}
        placeholder={
          'Will it rain in NYC on June 1?, 35\nWill SpaceX launch Starship this month? | 60%'
        }
        submitLabel={isCreating ? 'Creating...' : 'Create and add markets'}
        disabled={isCreating}
        onSubmit={async () => {
          const rows = createText
            .split('\n')
            .map(parseCreateMarketRow)
            .filter((row): row is BulkCreateMarketRow => !!row)
          if (rows.length === 0) {
            toast.error('Enter at least one market question.')
            return
          }
          setIsCreating(true)
          try {
            const markets = []
            for (const row of rows) {
              const market = await api('market', {
                question: row.question,
                outcomeType: 'BINARY',
                initialProb: row.initialProb,
                description: '',
                liquidityTier: 100,
                utcOffset: new Date().getTimezoneOffset(),
              })
              markets.push(market)
            }
            addQuestions(
              markets.map((market) => ({ type: 'question', slug: market.slug }))
            )
          } catch (e: any) {
            toast.error(e.message || 'Could not create markets.')
          } finally {
            setIsCreating(false)
          }
        }}
      />
    </div>
  )
}

function BulkAddSection(props: {
  title: string
  description: string
  value: string
  setValue: (value: string) => void
  placeholder: string
  submitLabel: string
  disabled?: boolean
  onSubmit: () => void
}) {
  const {
    title,
    description,
    value,
    setValue,
    placeholder,
    submitLabel,
    disabled,
    onSubmit,
  } = props
  return (
    <div className="border-ink-200 flex flex-col gap-2 border-t pt-4">
      <div>
        <div className="text-ink-900 text-sm font-semibold">{title}</div>
        <div className="text-ink-500 text-xs">{description}</div>
      </div>
      <textarea
        className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 min-h-[88px] rounded-md border p-2 text-sm shadow-sm focus:outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
      />
      <Button
        color="gray-outline"
        className="self-start"
        disabled={disabled}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </div>
  )
}

const parseMarketSlug = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed) return undefined
  const withoutQuery = trimmed.split(/[?#]/)[0].replace(/\/$/, '')
  const parts = withoutQuery.split('/').filter(Boolean)
  return parts[parts.length - 1]
}

type BulkCreateMarketRow = {
  question: string
  initialProb: number
}

const parseCreateMarketRow = (
  line: string
): BulkCreateMarketRow | undefined => {
  const trimmed = line.trim()
  if (!trimmed) return undefined
  const parts = trimmed.split(/\s*[,\t|]\s*/)
  const maybeProb = parts.length > 1 ? parts[parts.length - 1] : undefined
  const parsedProb = maybeProb ? Number(maybeProb.replace('%', '')) : undefined
  const hasProb = parsedProb !== undefined && !Number.isNaN(parsedProb)
  const question = (hasProb ? parts.slice(0, -1).join(', ') : trimmed).trim()
  if (!question) return undefined
  return {
    question,
    initialProb: hasProb
      ? Math.min(99, Math.max(1, Math.round(parsedProb)))
      : 50,
  }
}
