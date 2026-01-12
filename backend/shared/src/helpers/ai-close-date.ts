import * as dayjs from 'dayjs'
import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as utc from 'dayjs/plugin/utc'
import { log } from 'shared/utils'
import { aiModels, promptAI } from './prompt-ai'
dayjs.extend(utc)
dayjs.extend(customParseFormat)

export type CloseDateResult = {
  closeTime: number
  confidence: number
}

export const getCloseDate = async (
  question: string,
  utcOffset?: number
): Promise<CloseDateResult | undefined> => {
  const now = dayjs.utc().format('DD/MM/YYYY h:mm a')

  let response
  try {
    const prompt = `Analyze the user's question and return a JSON object with:
1. "date": The appropriate end/close date in the form DD/MM/YYYY h:mm a
2. "confidence": A number from 0-100 representing how confident you are that this is the correct close date

The end date will serve as a reminder to decide the outcome of their question.
If a question mentions 'by [date]', the end date should be the minute before that time happens.

Examples:
Question: 'Will I go to school tomorrow?'
Now: ${now}
Response: {"date": "${dayjs().add(1, 'day').format('DD/MM/YYYY h:mm a')}", "confidence": 95}

Question: 'Will humans land on Mars by 2028?'
Response: {"date": "31/12/2027 11:59 pm", "confidence": 98}
(Note: end date is the minute before 2028)

Question: 'Will the stock market crash in 2026?'
Response: {"date": "31/12/2026 11:59 pm", "confidence": 90}

Question: 'Will Ezra Klein run for office by EOY 2025?'
Response: {"date": "31/12/2025 11:59 pm", "confidence": 95}

Question: 'Will it rain?'
Response: {"date": "${dayjs().add(1, 'day').format('DD/MM/YYYY h:mm a')}", "confidence": 30}
(Note: no time frame specified, low confidence)

Question: 'Who will win the mass meme contest?'
Response: {"date": "${dayjs().add(7, 'day').format('DD/MM/YYYY h:mm a')}", "confidence": 20}
(Note: no clear end date, very low confidence)

IMPORTANT: Return ONLY the JSON object, nothing else. The date MUST be AFTER the current date (${now}).

Question: ${question}
Now: ${now}
Response:`
    response = await promptAI(prompt, {
      model: aiModels.flash,
      thinkingLevel: 'low',
    })
  } catch (e: any) {
    log.error('Error generating close date', { e })
    return undefined
  }
  log(response)
  if (!response) return undefined

  // Parse JSON response
  let parsed: { date: string; confidence: number }
  try {
    // Clean up response - remove markdown code blocks if present
    const cleaned = response.replace(/```json?\n?|\n?```/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (e) {
    log.error('Failed to parse close date JSON', { response, e })
    return undefined
  }

  const utcTime = dayjs.utc(parsed.date, 'DD/MM/YYYY h:mm a')
  const timestamp = utcTime.valueOf()
  if (!timestamp || !isFinite(timestamp) || utcTime.isBefore(dayjs())) {
    log.error('Invalid close date', { response: parsed.date })
    return undefined
  }

  // Clamp confidence to 0-100
  const confidence = Math.max(0, Math.min(100, parsed.confidence ?? 50))

  // adjust for local timezone
  return {
    closeTime: utcTime.utcOffset(utcOffset ?? 0).valueOf(),
    confidence,
  }
}
