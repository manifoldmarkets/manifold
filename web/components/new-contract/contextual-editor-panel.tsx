import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { CreateableOutcomeType, PollType } from 'common/contract'
import { Group } from 'common/group'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { Input } from '../widgets/input'
import { CostSection } from './cost-section'

const POLL_TYPE_OPTIONS: { value: PollType; label: string }[] = [
  { value: 'single', label: 'Single Vote' },
  { value: 'multi-select', label: 'Multi-Select' },
  { value: 'ranked-choice', label: 'Ranked Choice' },
]

export type FormState = {
  question: string
  outcomeType: CreateableOutcomeType | null
  description?: JSONContent
  answers: string[]
  closeDate?: string
  closeHoursMinutes?: string
  neverCloses: boolean
  selectedGroups: Group[]
  visibility: 'public' | 'unlisted'
  liquidityTier: number
  shouldAnswersSumToOne?: boolean
  addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
  probability?: number
  min?: number
  max?: number
  minString?: string
  maxString?: string
  unit?: string
  midpoints?: number[]
  isAnnouncement?: boolean
  isChangeLog?: boolean
  includeSeeResults?: boolean // For POLLs - adds "See results" option
  // Poll-specific options
  pollType?: PollType // 'single' | 'multi-select' | 'ranked-choice'
  maxSelections?: number // For multi-select polls
}

export type ValidationErrors = {
  [key: string]: string
}

export function ContextualEditorPanel(props: {
  formState: FormState
  onUpdate: (field: string, value: any) => void
  validationErrors: ValidationErrors
  onGenerateAnswers?: () => void
  isGeneratingAnswers?: boolean
  balance?: number
  submitState?: 'EDITING' | 'LOADING' | 'DONE'
}) {
  const { formState, onUpdate, balance, validationErrors } = props

  const { outcomeType, answers, liquidityTier } = formState
  const isPoll = outcomeType === 'POLL'
  const hasBalanceError = !!validationErrors.balance

  return (
    <Col
      className={clsx(
        'gap-4 overflow-y-auto rounded-lg border-0 p-4 shadow-none outline-none ring-offset-0 focus-within:outline-none focus:outline-none focus:ring-offset-0 focus-visible:outline-none',
        hasBalanceError
          ? 'ring-2 ring-red-500 focus-within:ring-2 focus-within:ring-red-500 dark:ring-red-600 dark:focus-within:ring-red-600'
          : 'ring-1 ring-transparent'
      )}
    >
      {isPoll ? (
        <PollOptionsSection formState={formState} onUpdate={onUpdate} />
      ) : (
        <>
          {/* Liquidity & Cost */}
          {balance !== undefined && (
            <Col className="gap-3">
              <span className="text-ink-700 text-sm font-semibold">
                Liquidity
              </span>
              <CostSection
                balance={balance}
                outcomeType={outcomeType as any}
                liquidityTier={liquidityTier}
                setLiquidityTier={(tier) => onUpdate('liquidityTier', tier)}
                numAnswers={answers.length > 0 ? answers.length : undefined}
              />
            </Col>
          )}
        </>
      )}
    </Col>
  )
}

function PollOptionsSection(props: {
  formState: FormState
  onUpdate: (field: string, value: any) => void
}) {
  const { formState, onUpdate } = props
  const { pollType = 'single', maxSelections, answers } = formState

  return (
    <Col className="gap-4">
      <Col className="gap-2">
        <span className="text-ink-700 text-sm font-semibold">About polls</span>
        <p className="text-ink-600 text-sm">
          {pollType === 'single' &&
            'People can vote for one option, but they cannot bet.'}
          {pollType === 'multi-select' &&
            'People can vote for multiple options, but they cannot bet.'}
          {pollType === 'ranked-choice' &&
            'People rank the options in order of preference, but they cannot bet.'}
        </p>
      </Col>

      <Col className="mb-4 gap-2">
        <span className="text-ink-700 text-sm font-semibold">Poll type</span>
        <ChoicesToggleGroup
          className="w-fit"
          currentChoice={pollType}
          choicesMap={Object.fromEntries(
            POLL_TYPE_OPTIONS.map((o) => [o.label, o.value])
          )}
          setChoice={(value) => {
            onUpdate('pollType', value)
            // Disable "See results" for multi-select and ranked-choice
            if (value !== 'single') {
              onUpdate('includeSeeResults', false)
            }
          }}
        />
      </Col>

      {pollType === 'multi-select' && (
        <Col className="-mt-4 gap-2">
          <Row className="items-center gap-2">
            <span className="text-ink-700 text-sm font-semibold">
              Max votes
            </span>
            <span className="text-ink-500 text-xs">(optional)</span>
          </Row>
          <Input
            type="number"
            min={1}
            max={answers.length || 100}
            placeholder={`${answers.length || 'all'}`}
            value={maxSelections ?? ''}
            onChange={(e) => {
              const val = e.target.value
              onUpdate(
                'maxSelections',
                val === '' ? undefined : parseInt(val, 10)
              )
            }}
            className="mb-4 w-32"
          />
        </Col>
      )}
    </Col>
  )
}
