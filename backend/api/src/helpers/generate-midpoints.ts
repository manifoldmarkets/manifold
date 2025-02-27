import { log } from 'shared/utils'
import { api } from 'shared/api'
import { MULTI_NUMERIC_BUCKETS_MAX } from 'common/contract'

/**
 * Helper function to generate numeric midpoints for a set of answers
 */
export async function generateNumericMidpoints(
  question: string,
  answers: string[],
  min: number,
  max: number,
  unit: string
): Promise<number[]> {
  if (answers.length > MULTI_NUMERIC_BUCKETS_MAX) {
    throw new Error(`Too many answers (${answers.length}) for numeric market`)
  }
  
  try {
    // First try using the regenerate-numeric-midpoints endpoint
    const result = await api('regenerate-numeric-midpoints', {
      question,
      answers,
      min,
      max,
      unit,
      tab: 'buckets'
    })
    
    if (result.midpoints && result.midpoints.length === answers.length) {
      return result.midpoints
    }
    
    throw new Error('Midpoint generation returned incorrect number of midpoints')
  } catch (error) {
    log.error('Error using API to generate midpoints:', error)
    
    // Fallback to simple linear distribution
    return generateLinearMidpoints(min, max, answers.length)
  }
}

/**
 * Generate linearly distributed midpoints as a fallback
 */
function generateLinearMidpoints(min: number, max: number, count: number): number[] {
  const step = (max - min) / count
  const midpoints: number[] = []
  
  for (let i = 0; i < count; i++) {
    // Use midpoint of each bucket as the value
    const bucketMin = min + i * step
    const bucketMax = min + (i + 1) * step
    midpoints.push((bucketMin + bucketMax) / 2)
  }
  
  return midpoints
}
