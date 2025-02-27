import { APIError, APIHandler } from './helpers/endpoint'
import { SupabaseDirectClient, createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract } from 'shared/utils'
import { isAdminId } from 'common/envs/constants'
import { Answer } from 'common/answer'
import { Contract, CPMMMultiContract } from 'common/contract'
import { log } from 'shared/utils'
import { updateContract } from 'shared/supabase/contracts'
import { bulkUpdateAnswers } from 'shared/supabase/answers'
import { convertAnswer } from 'common/supabase/contracts'
import { revalidateContractStaticProps } from 'shared/utils'
import { generateNumericMidpoints } from './helpers/generate-midpoints'
import { track } from 'shared/analytics'

export const convertMarketToNumeric: APIHandler<'convert-market-to-numeric'> = async (
  props,
  auth
) => {
  const { contractId, unit, min, max } = props
  
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can convert markets to numeric')
  }

  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  
  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }
  
  if (contract.outcomeType !== 'MULTIPLE_CHOICE') {
    throw new APIError(400, 'Can only convert MULTIPLE_CHOICE markets to MULTI_NUMERIC')
  }
  
  if (contract.mechanism !== 'cpmm-multi-1') {
    throw new APIError(400, 'Can only convert cpmm-multi-1 markets')
  }
  
  // This is a CPMM Multiple Choice contract
  const multiContract = contract as CPMMMultiContract
  
  // Get all answers for this contract
  const answers = multiContract.answers
  
  if (answers.length === 0) {
    throw new APIError(400, 'Contract has no answers')
  }
  
  // Generate midpoints for the answers
  const midpoints = await generateMidpointsForAnswers(
    pg, 
    contract, 
    answers, 
    unit, 
    min !== undefined ? Number(min) : undefined,
    max !== undefined ? Number(max) : undefined
  )
  
  // Update contract and answers
  await updateContractAndAnswers(pg, contract, answers, midpoints, unit)
  
  // Return the updated contract
  const updatedContract = await getContract(pg, contractId)
  
  track(auth.uid, 'convert-market-to-numeric', {
    contractId,
    originalType: 'MULTIPLE_CHOICE',
    newType: 'MULTI_NUMERIC'
  })
  
  return {
    result: { success: true, contract: updatedContract },
    continue: async () => {
      // Revalidate contract props
      await revalidateContractStaticProps(updatedContract!)
    }
  }
}

async function generateMidpointsForAnswers(
  pg: SupabaseDirectClient, 
  contract: Contract, 
  answers: Answer[], 
  unit: string,
  minOverride?: number,
  maxOverride?: number
): Promise<number[]> {
  try {
    // If min and max are provided, use them
    // Otherwise, try to infer reasonable defaults from the answers
    const min = minOverride ?? 0
    const max = minOverride !== undefined && maxOverride !== undefined
      ? maxOverride
      : answers.length * 10  // Simple heuristic if not provided
    
    const midpoints = await generateNumericMidpoints(
      contract.question,
      answers.map(a => a.text),
      min,
      max,
      unit
    )
    
    // Make sure we have the right number of midpoints
    if (midpoints.length !== answers.length) {
      throw new APIError(
        500, 
        `Generated ${midpoints.length} midpoints for ${answers.length} answers`
      )
    }
    
    return midpoints
  } catch (error) {
    log.error('Error generating midpoints:', error)
    throw new APIError(500, 'Failed to generate midpoints for answers')
  }
}

async function updateContractAndAnswers(
  pg: SupabaseDirectClient,
  contract: Contract,
  answers: Answer[],
  midpoints: number[],
  unit: string
) {
  try {
    // Start a transaction
    return await pg.tx(async (tx) => {
      // 1. Update contract type
      await updateContract(tx, contract.id, {
        outcomeType: 'MULTI_NUMERIC',
        unit,
        shouldAnswersSumToOne: true,
        addAnswersMode: 'DISABLED'
      })
      
      // 2. Update all answers with midpoints
      const answerUpdates = answers.map((answer, index) => ({
        id: answer.id,
        midpoint: midpoints[index]
      }))
      
      await bulkUpdateAnswers(tx, answerUpdates)
      
      log('Successfully converted contract to MULTI_NUMERIC:', contract.id)
    })
  } catch (error) {
    log.error('Error updating contract and answers:', error)
    throw new APIError(500, 'Failed to update contract and answers')
  }
}
