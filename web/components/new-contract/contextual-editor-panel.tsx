import { JSONContent } from '@tiptap/core'
import { Col } from 'web/components/layout/col'
import { CreateableOutcomeType } from 'common/contract'
import { Group } from 'common/group'
import { CostSection } from './cost-section'
import clsx from 'clsx'

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
        'gap-4 overflow-y-auto rounded-lg border-0 p-4 shadow-none outline-none ring-offset-0 focus:outline-none focus:ring-offset-0 focus-within:outline-none focus-visible:outline-none',
        hasBalanceError
          ? 'ring-2 ring-red-500 dark:ring-red-600 focus-within:ring-2 focus-within:ring-red-500 dark:focus-within:ring-red-600'
          : 'ring-1 ring-transparent'
      )}
    >
      {isPoll ? (
        <Col className="gap-2">
          <span className="text-ink-700 text-sm font-semibold">About polls</span>
          <p className="text-ink-600 text-sm">
            This is a poll, people can select an answer but they cannot bet. You
            may want to add a "see results" answer, because one is not added
            automatically.
          </p>
        </Col>
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
