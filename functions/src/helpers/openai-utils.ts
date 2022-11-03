import * as dayjs from 'dayjs'
import * as admin from 'firebase-admin'
import { Configuration, OpenAIApi } from 'openai'

import { filterTopGroups, Group } from '../../../common/group'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})

const openai = new OpenAIApi(configuration)

export const getGroupForMarket = async (question: string) => {
  const groups = await getGroups()

  const groupsList = groups.map((g) => g.name).join('\n')

  const response = await openai.createCompletion({
    model: 'text-davinci-002',
    prompt: `Categories:\n\n${groupsList}\n\nQuestion: ${question}\nSelected category:`,
    temperature: 0.4,
    max_tokens: 3,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  })

  if (response.status !== 200) return undefined

  const text = response.data.choices[0].text?.trim()
  if (!text) return undefined

  return groups.find((g) => g.name.toLowerCase().startsWith(text?.toLowerCase()))
}

export const getCloseDate = async (question: string) => {
  const now = dayjs().format('M/D/YYYY h:mm a')

  const response = await openai.createCompletion({
    model: 'text-davinci-002',
    prompt: `Question: Will an AI-drawn movie have a rating >=7.0 on IMDB before 2025?\nNow: 5/2/2019 3:47 pm\nEnd date: 12/31/2025 11:59 pm\n\nQuestion: Will Bolsanaro concede the election by Nov 15?\nNow: 8/5/2022 1:20 pm\nEnd date: 11/14/2022 11:59 pm\n\nQuestion: Will Dwarf Fortress be released on Steam this year?\nNow: 2/5/2023 11:24 am\nEnd date: 12/31/2023 11:59 pm\n\nQuestion: Will eat ice cream today?\nNow: 10/2/2022 5:55 pm\nEnd date: 10/2/2022 11:59 pm\n\nQuestion: ${question}\nNow: ${now}\nEnd date:`,
    temperature: 0.4,
    max_tokens: 15,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  })

  if (response.status !== 200) return undefined

  const text = response.data.choices[0].text?.trim()
  if (!text) return undefined

  return dayjs(text, 'M/D/YYYY h:mm a').valueOf()
}

const firestore = admin.firestore()

const getGroups = async () => {
  const snap = await firestore
    .collection('groups')
    .where('anyoneCanJoin', '==', true)
    .get()

  const groups = snap.docs.map((d) => d.data() as Group)

  return filterTopGroups(groups)
}
