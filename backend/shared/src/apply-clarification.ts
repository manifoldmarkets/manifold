import { JSONContent } from '@tiptap/core'
import { DEV_HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { Contract } from 'common/contract'
import { cloneDeep } from 'lodash'
import { track } from 'shared/analytics'
import { createAIDescriptionUpdateNotification } from 'shared/create-notification'
import { recordContractEdit } from 'shared/record-contract-edit'
import { updateContract } from 'shared/supabase/contracts'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { anythingToRichText } from 'shared/tiptap'
import { isProd, log, revalidateContractStaticProps } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'

// Shared function to apply a clarification to a contract
// Returns true if applied, false if already present
export async function applyClarificationToContract(
  pg: SupabaseDirectClient,
  contract: Contract,
  commentId: string,
  markdown: string
): Promise<boolean> {
  // Check if this clarification is already in the description (prevents double-apply race condition)
  const descriptionText = getDescriptionText(contract.description)
  if (descriptionText.includes(`#${commentId}`)) {
    log('Clarification already applied, skipping:', {
      contractId: contract.id,
      commentId,
    })
    return false
  }

  const dateParts = new Date()
    .toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .split('/')
  const date = `${dateParts[2]}-${dateParts[0]}-${dateParts[1]}`
  const timeZone = new Date()
    .toLocaleDateString('en-US', { timeZoneName: 'short' })
    .includes('PDT')
    ? 'PDT'
    : 'PST'

  // Combine the date prefix with the markdown content, then convert to rich text
  const markdownToAppend = `- Update ${date} (${timeZone}) ${markdown} `
  const appendContent = anythingToRichText({ markdown: markdownToAppend })

  // Create deep copy of the old description to update history correctly
  const oldDescription = cloneDeep(contract.description)
  let newDescription: JSONContent | undefined

  if (typeof oldDescription === 'string') {
    const oldRichText = anythingToRichText({ raw: oldDescription })
    newDescription = {
      type: 'doc',
      content: [
        ...(oldRichText?.content ?? []),
        { type: 'paragraph' },
        ...(appendContent?.content ?? []),
      ],
    }
  } else {
    oldDescription.content?.push(
      { type: 'paragraph' }, // acts as newline
      ...(appendContent?.content ?? [])
    )
    newDescription = oldDescription
  }

  await updateContract(pg, contract.id, {
    description: newDescription,
  })

  // Broadcast the contract update via websocket
  broadcastUpdatedContract(contract.visibility, {
    id: contract.id,
    description: newDescription,
  })

  const editorID = isProd()
    ? '8lZo8X5lewh4hnCoreI7iSc0GxK2' // ManifoldAI user id
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

  // Revalidate and record the edit
  await revalidateContractStaticProps(contract)
  await recordContractEdit(contract, editorID, ['description'])

  track(editorID, 'ai clarification added', {
    contractId: contract.id,
    slug: contract.slug,
    question: contract.question,
  })

  await createAIDescriptionUpdateNotification(contract, markdownToAppend)

  log('Clarification applied:', {
    contractId: contract.id,
    commentId,
  })

  return true
}

// Extract text content from a description (string or JSONContent)
function getDescriptionText(description: string | JSONContent): string {
  if (typeof description === 'string') {
    return description
  }
  return extractTextFromJsonContent(description)
}

// Recursively extract text from JSONContent
function extractTextFromJsonContent(node: JSONContent): string {
  let text = ''

  if (node.text) {
    text += node.text
  }

  // Check for links with href containing the comment ID
  if (node.marks) {
    for (const mark of node.marks) {
      if (mark.type === 'link' && mark.attrs?.href) {
        text += mark.attrs.href
      }
    }
  }

  if (node.content) {
    for (const child of node.content) {
      text += extractTextFromJsonContent(child)
    }
  }

  return text
}
