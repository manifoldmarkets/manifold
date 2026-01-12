import { JSONContent } from '@tiptap/core'
import { richTextToString } from 'common/util/parse'
import * as fs from 'fs'
import { runScript } from 'run-script'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'

// Check if JSONContent contains any links
function hasLinks(content: JSONContent | null | undefined): boolean {
  if (!content) return false
  // Check marks for link type
  if (content.marks?.some((mark) => mark.type === 'link')) {
    return true
  }
  // Check if this is a link node
  if (content.type === 'link') {
    return true
  }
  // Recursively check children
  if (content.content) {
    return content.content.some((child) => hasLinks(child))
  }
  return false
}

async function isSpam(
  commentText: string,
  marketTitle: string
): Promise<boolean> {
  const prompt = `You are a spam detector. Analyze the following comment that was posted on a prediction market AFTER it resolved.

Market title: "${marketTitle}"

Comment:
"""
${commentText}
"""

Is this comment spam? Spam comments typically:
- Contain promotional links to unrelated websites
- Mention products, services, or websites that have nothing to do with the market topic
- Include random irrelevant text alongside links
- Are SEO spam trying to promote unrelated content

Respond with ONLY "yes" if this is spam, or "no" if it's a legitimate comment.`

  try {
    const response = await promptAI(prompt, {
      model: aiModels.flash,
      thinkingLevel: 'minimal',
    })
    return response.toLowerCase().trim() === 'yes'
  } catch (e) {
    console.error('Error calling Gemini:', e)
    return false
  }
}

if (require.main === module) {
  runScript(async ({ pg }) => {
    // Find top-level comments with links that were created after the market resolved
    // Only from users who have never placed a bet (likely spammers)
    const comments = await pg.manyOrNone<{
      commentId: string
      content: JSONContent | undefined | null
      marketTitle: string
    }>(
      `select
        cc.comment_id as "commentId",
        cc.data->'content' as content,
        c.question as "marketTitle"
      from contract_comments cc
      join contracts c on c.id = cc.contract_id
      join users u on u.id = cc.user_id
      where
        -- Market is resolved
        c.resolution_time is not null
        -- Not already deleted or hidden
        and coalesce((cc.data->>'deleted')::boolean, false) = false
        and coalesce((cc.data->>'hidden')::boolean, false) = false
        -- User has never placed a bet
        and (u.data->>'lastBetTime') is null
        and u.id != 'PNiqYrNgSfWKwO5Cyu76iO8tvnC2' -- manifold in the wild
      order by cc.created_time desc`
    )

    console.log(
      `Found ${comments.length} comments by users who have never placed a bet on resolved markets.`
    )

    // Filter to only comments with links
    const commentsWithLinks = comments.filter((c) => hasLinks(c.content))
    console.log(`${commentsWithLinks.length} of those have links.`)

    // CSV header
    const csvRows: string[] = ['comment_id,comment_text']
    let spamCount = 0

    for (let i = 0; i < commentsWithLinks.length; i++) {
      const comment = commentsWithLinks[i]
      const commentText = richTextToString(comment.content ?? undefined)

      if (!commentText.trim()) continue

      console.log(
        `\nChecking comment ${i + 1}/${commentsWithLinks.length} (${
          comment.commentId
        }), ${commentText.substring(0, 200)}...`
      )

      const spam = await isSpam(commentText, comment.marketTitle)

      if (spam) {
        spamCount++
        console.log(`  SPAM DETECTED: ${commentText.substring(0, 100)}...`)
        // Escape quotes and newlines for CSV
        const escapedText = commentText
          .replace(/"/g, '""')
          .replace(/\n/g, '\\n')
        csvRows.push(`"${comment.commentId}","${escapedText}"`)
      } else {
        console.log(`  Not spam`)
      }

      // Rate limiting - wait 500ms between API calls
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Write CSV file
    const outputPath = 'spam-comments.csv'
    fs.writeFileSync(outputPath, csvRows.join('\n'))

    console.log(`\n=== Summary ===`)
    console.log(`Total comments checked: ${commentsWithLinks.length}`)
    console.log(`Spam comments found: ${spamCount}`)
    console.log(`Results written to: ${outputPath}`)
  })
}
