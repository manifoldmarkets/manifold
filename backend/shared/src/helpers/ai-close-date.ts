import * as dayjs from 'dayjs'
import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as utc from 'dayjs/plugin/utc'
import { log } from 'shared/utils'
import { aiModels, promptAI } from './prompt-ai'
dayjs.extend(utc)
dayjs.extend(customParseFormat)

export const getCloseDate = async (question: string, utcOffset?: number) => {
  const now = dayjs.utc().format('DD/MM/YYYY h:mm a')

  let response
  try {
    const prompt = `Please return the user's desired end date and nothing else for their question in the form: DD/MM/YYYY h:mm a.
     The end date will serve as a reminder to decide the outcome of their question.
     If a question is titled by 'date', the end date should be the minute before that time happens.
     For example, if the question is 'by 2028', the end date should be the minute before 2028: 31/12/2027 11:59 pm.
     Examples:
     Question: 'Will I go to school tomorrow?'
     now: ${now}
     End date: ${dayjs().add(1, 'day').format('DD/MM/YYYY h:mm a')}

     Question: 'Will humans land on Mars by 2028?'
     End date: 31/12/2027 11:59 pm
     (Note how the end date is the minute before 2028, ie in 2027.)

     Question: 'Will the stock market crash in 2026?'
     End date: 31/12/2026 11:59 pm

     Question: 'Will Ezra Klein run for office by EOY 2025?'
     End date: 31/12/2025 11:59 pm
     (Note how the end date is the minute before the end of 2025, ie in 2025.)

    Here's their question, and remember: ONLY return the end date in the form: DD/MM/YYYY h:mm.
    Make absolutely SURE it's AFTER the current date (${now}).

    Question: ${question}
    Now: ${now}
    End date:`
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

  const utcTime = dayjs.utc(response, 'DD/MM/YYYY h:mm a')
  const timestamp = utcTime.valueOf()
  if (!timestamp || !isFinite(timestamp) || utcTime.isBefore(dayjs())) {
    log.error('Invalid close date', { response })
    return undefined
  }

  // adjust for local timezone
  return utcTime.utcOffset(utcOffset ?? 0).valueOf()
}
