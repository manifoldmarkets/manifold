import { JSONContent } from '@tiptap/core'
import { Col } from 'web/components/layout/col'
import { CreateableOutcomeType } from 'common/contract'
import { Group } from 'common/group'
import { CostSection } from './cost-section'

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
  totalBounty?: number
  min?: number
  max?: number
  minString?: string
  maxString?: string
  unit?: string
  midpoints?: number[]
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

  return (
    <Col className="bg-canvas-0 ring-ink-100 gap-4 overflow-y-auto rounded-lg p-4 shadow-md ring-1">
      {/* Liquidity & Cost */}
      {balance !== undefined && (
        <Col className="gap-3">
          <span className="text-ink-700 text-sm font-semibold">Liquidity</span>
          <CostSection
            balance={balance}
            outcomeType={outcomeType as any}
            liquidityTier={liquidityTier}
            setLiquidityTier={(tier) => onUpdate('liquidityTier', tier)}
            numAnswers={answers.length > 0 ? answers.length : undefined}
          />
        </Col>
      )}
    </Col>
  )
}
