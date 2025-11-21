import { JSONContent } from '@tiptap/core'
import { Col } from 'web/components/layout/col'
import { CreateableOutcomeType } from 'common/contract'
import { Group } from 'common/group'
import { CostSection } from './cost-section'

export type FormState = {
  question: string
  outcomeType: CreateableOutcomeType | 'DISCUSSION_POST' | null
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
  const { formState, onUpdate, balance } = props

  const { outcomeType, answers, liquidityTier } = formState
  const isPoll = outcomeType === 'POLL'

  return (
    <Col className="bg-canvas-0 ring-ink-100 gap-4 overflow-y-auto rounded-lg p-4 shadow-md ring-1">
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
