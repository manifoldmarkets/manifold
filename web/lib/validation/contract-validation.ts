import { OutcomeType } from 'common/contract'
import { JSONContent } from '@tiptap/core'

export type ContractFormState = {
  question: string
  outcomeType: OutcomeType
  description?: JSONContent
  answers: string[]
  closeDate?: string
  closeHoursMinutes?: string
  neverCloses: boolean
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
  initialValue?: number
  isLogScale?: boolean
  precision?: number
}

export type ValidationErrors = {
  [key: string]: string
}

export type ValidationWarnings = {
  [key: string]: string
}

export type ValidationResult = {
  errors: ValidationErrors
  warnings: ValidationWarnings
  isValid: boolean
}

const MAX_QUESTION_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 16000
const MIN_ANSWERS = 2
const MIN_BOUNTY = 100

export function validateContractForm(
  state: ContractFormState
): ValidationResult {
  const errors: ValidationErrors = {}
  const warnings: ValidationWarnings = {}

  const {
    question,
    outcomeType,
    description,
    answers,
    closeDate,
    neverCloses,
    totalBounty,
    min,
    max,
    initialValue,
    precision,
  } = state

  // Question validation
  if (!question || question.trim().length === 0) {
    errors.question = 'Question is required'
  } else if (question.length > MAX_QUESTION_LENGTH) {
    errors.question = `Question must be ${MAX_QUESTION_LENGTH} characters or less`
  }

  // Description validation
  if (description) {
    const descriptionText = JSON.stringify(description)
    if (descriptionText.length > MAX_DESCRIPTION_LENGTH) {
      errors.description = `Description is too long (max ${MAX_DESCRIPTION_LENGTH} characters)`
    }
  }

  // Close date validation
  if (
    !neverCloses &&
    closeDate &&
    outcomeType !== 'STONK' &&
    outcomeType !== 'BOUNTIED_QUESTION'
  ) {
    const closeTime = new Date(closeDate + 'T23:59').getTime()
    if (closeTime <= Date.now()) {
      errors.closeDate = 'Close date must be in the future'
    }
  }

  // Type-specific validation
  switch (outcomeType) {
    case 'MULTIPLE_CHOICE':
    case 'POLL':
      if (!answers || answers.length < MIN_ANSWERS) {
        errors.answers = `At least ${MIN_ANSWERS} answers are required`
      } else {
        const nonEmptyAnswers = answers.filter((a) => a.trim().length > 0)
        if (nonEmptyAnswers.length < MIN_ANSWERS) {
          errors.answers = `At least ${MIN_ANSWERS} non-empty answers are required`
        }
      }

      // Check for duplicate answers
      const uniqueAnswers = new Set(answers.filter((a) => a.trim().length > 0))
      if (
        uniqueAnswers.size < answers.filter((a) => a.trim().length > 0).length
      ) {
        warnings.answers = 'Some answers are duplicates'
      }
      break

    case 'MULTI_NUMERIC':
      if (min === undefined || max === undefined) {
        errors.range = 'Min and max values are required'
      } else if (min >= max) {
        errors.range = 'Max must be greater than min'
      }

      if (!answers || answers.length < MIN_ANSWERS) {
        errors.answers = `At least ${MIN_ANSWERS} answers are required`
      }
      break

    case 'DATE':
      // Date markets need date range strings
      if (!state.minString || !state.maxString) {
        errors.range = 'Start and end dates are required'
      }

      if (!answers || answers.length < MIN_ANSWERS) {
        errors.answers = `At least ${MIN_ANSWERS} answers are required`
      }
      break

    case 'PSEUDO_NUMERIC':
      if (min === undefined || max === undefined) {
        errors.range = 'Min and max values are required'
      } else if (min >= max) {
        errors.range = 'Max must be greater than min'
      } else if (max - min < 0.01) {
        errors.range = 'Range must be at least 0.01'
      }

      if (
        initialValue !== undefined &&
        min !== undefined &&
        max !== undefined
      ) {
        if (initialValue < min || initialValue > max) {
          errors.initialValue = 'Initial value must be between min and max'
        }
      }
      break

    case 'NUMBER':
      if (min === undefined || max === undefined) {
        errors.range = 'Min and max values are required'
      } else if (min >= max) {
        errors.range = 'Max must be greater than min'
      }

      if (precision !== undefined) {
        if (precision < 1 || precision > 50) {
          errors.precision = 'Precision must be between 1 and 50'
        }
      }
      break

    case 'BOUNTIED_QUESTION':
      if (!totalBounty || totalBounty < MIN_BOUNTY) {
        errors.totalBounty = `Bounty must be at least M$${MIN_BOUNTY}`
      }
      break

    case 'BINARY':
      // Binary markets always need a close date unless it's a STONK
      if (!neverCloses && !closeDate) {
        errors.closeDate = 'Close date is required'
      }
      break
  }

  return {
    errors,
    warnings,
    isValid: Object.keys(errors).length === 0,
  }
}

// Helper function to get error message for a specific field
export function getFieldError(
  validationResult: ValidationResult,
  field: string
): string | undefined {
  return validationResult.errors[field]
}

// Helper function to get warning message for a specific field
export function getFieldWarning(
  validationResult: ValidationResult,
  field: string
): string | undefined {
  return validationResult.warnings[field]
}

// Helper function to check if form is ready to submit
export function canSubmitForm(
  state: ContractFormState,
  validationResult: ValidationResult
): boolean {
  return validationResult.isValid && state.question.trim().length > 0
}
