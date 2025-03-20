import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import { models, promptClaude } from './claude'
import { log } from 'shared/utils'
dayjs.extend(utc)
export type MODELS = 'o3-mini'

export const getCloseDate = async (question: string, utcOffset?: number) => {
  const now = dayjs.utc().format('M/D/YYYY h:mm a')

  let response
  try {
    const prompt = `Please return the user's desired end date and nothing else for their question in the form: MM/DD/YYYY HH:mm am/pm.
     The end date will serve as a reminder to decide the outcome of their question.
     If a question is titled by 'date', the end date should be the minute before that time happens.
     For example, if the question is 'by 2028', the end date should be the minute before 2028: 12/31/2027 11:59 pm.
     Examples:
     Question: 'Will I go to school tomorrow?'
     now: ${now}
     End date: ${dayjs().add(1, 'day').format('M/D/YYYY h:mm a')}

     Question: 'Will humans land on Mars by 2028?'
     End date: 12/31/2027 11:59 pm
     (Note how the end date is the minute before 2028, ie in 2027.)

     Question: 'Will the stock market crash in 2026?'
     End date: 12/31/2026 11:59 pm

     Question: 'Will Ezra Klein run for office by EOY 2025?'
     End date: 12/31/2025 11:59 pm
     (Note how the end date is the minute before the end of 2025, ie in 2025.)

    Here's their question, and remember: ONLY return the end date in the form: MM/DD/YYYY HH:mm am/pm.

    Question: ${question}
    Now: ${now}
    End date:`
    response = await promptClaude(prompt, {
      model: models.haiku,
    })
  } catch (e: any) {
    log.error('Error generating close date', { e })
    return undefined
  }

  if (!response) return undefined

  const utcTime = dayjs.utc(response, 'M/D/YYYY h:mm a')
  const timestamp = utcTime.valueOf()
  if (!timestamp || !isFinite(timestamp)) return undefined

  // adjust for local timezone
  return utcTime.utcOffset(utcOffset ?? 0).valueOf()
}
