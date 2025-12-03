import { ValidationErrors } from 'web/lib/validation/contract-validation'

/**
 * Maps validation error keys to CSS selectors for form elements
 */
const FIELD_SELECTORS: Record<string, string> = {
  question: '#market-preview-title-input',
  description: '.ProseMirror',
  answers: '#answer-input-0, #generate-date-ranges-button, #generate-numeric-ranges-button, textarea[placeholder="Answer 1"], textarea[placeholder="Option 1"]',
  range: 'input[type="number"][name="min"], input[type="number"][name="max"]',
  totalBounty: 'input[name="bounty"]',
  closeDate: 'input[type="date"]',
  precision: 'input[name="precision"]',
  initialValue: 'input[name="initialValue"]',
}

/**
 * Scrolls to the first error field in the validation errors object
 * and attempts to focus it if it's an input element
 *
 * @param errors - The validation errors object from validateContractForm
 */
export function scrollToFirstError(errors: ValidationErrors): void {
  const errorKeys = Object.keys(errors)
  if (errorKeys.length === 0) return

  const firstErrorKey = errorKeys[0]
  const selector = FIELD_SELECTORS[firstErrorKey]

  if (!selector) {
    // If no selector mapping exists, try generic scroll to top of form
    console.warn(`No selector mapping for error field: ${firstErrorKey}`)
    const marketPreview = document.querySelector('#market-preview')
    marketPreview?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  // Try each selector in the comma-separated list
  const selectors = selector.split(',').map(s => s.trim())
  let element: Element | null = null

  for (const sel of selectors) {
    element = document.querySelector(sel)
    if (element) break
  }

  if (!element) {
    console.warn(`Could not find element for selector: ${selector}`)
    return
  }

  // Scroll element into view
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // Auto-focus if it's an input/textarea/button element
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
  ) {
    setTimeout(() => {
      element.focus()
    }, 300) // Delay to allow scroll animation to complete
  }
}
