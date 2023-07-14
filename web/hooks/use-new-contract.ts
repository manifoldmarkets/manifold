import { User } from 'common/user'
import { NewQuestionParams } from 'web/components/new-contract/new-contract-panel'
import { usePersistentLocalState } from './use-persistent-local-state'
import {
  Contract,
  MAX_DESCRIPTION_LENGTH,
  NON_BETTING_OUTCOMES,
  OutcomeType,
  Visibility,
} from 'common/contract'
import { useEffect, useState } from 'react'
import { getGroup } from 'web/lib/supabase/group'
import { getAnte } from 'common/economy'
import dayjs from 'dayjs'
import { Group } from 'common/group'
import { generateJSON } from '@tiptap/core'
import { STONK_NO, STONK_YES } from 'common/stonk'
import { extensions } from 'common/util/parse'
import { useTextEditor } from 'web/components/widgets/editor'
import { safeLocalStorage } from 'web/lib/util/local'
import { createMarket } from 'web/lib/firebase/api'
import { removeUndefinedProps } from 'common/util/object'
import { track } from 'web/lib/service/analytics'

const descriptionPlaceholder =
  'Optional. Provide background info and question resolution criteria here.'

export const useNewContract = (
  creator: User,
  params: NewQuestionParams | undefined,
  outcomeType: OutcomeType
) => {
  // If params specify content like a question, store it separately in local storage.
  const paramsKey = params?.q ?? ''

  const [minString, setMinString] = usePersistentLocalState(
    params?.min ?? '',
    'new-min' + paramsKey
  )
  const [maxString, setMaxString] = usePersistentLocalState(
    params?.max ?? '',
    'new-max' + paramsKey
  )
  const [isLogScale, setIsLogScale] = usePersistentLocalState<boolean>(
    !!params?.isLogScale,
    'new-is-log-scale' + paramsKey
  )

  const [initialValueString, setInitialValueString] = usePersistentLocalState(
    params?.initValue,
    'new-init-value' + paramsKey
  )
  const [visibility, setVisibility] = usePersistentLocalState<Visibility>(
    (params?.visibility as Visibility) ?? 'public',
    `new-visibility${'-' + params?.groupId ?? ''}`
  )
  const [newContract, setNewContract] = useState<Contract | undefined>(
    undefined
  )

  const paramAnswers = []
  let i = 0
  while (params && (params as any)[`a${i}`]) {
    paramAnswers.push((params as any)[`a${i}`])
    i++
  }
  // for multiple choice, init to 2 empty answers
  const [answers, setAnswers] = usePersistentLocalState(
    paramAnswers.length ? paramAnswers : ['', ''],
    'new-answers' + paramsKey
  )
  console.log('paramAnswers', paramAnswers, 'answers', answers)

  const [question, setQuestion] = usePersistentLocalState(
    '',
    'new-question' + paramsKey
  )
  useEffect(() => {
    if (params?.q) setQuestion(params?.q ?? '')
  }, [params?.q])

  useEffect(() => {
    if (params?.groupId) {
      getGroup(params?.groupId).then((group) => {
        if (group) {
          setSelectedGroup(group)
        }
      })
    }
  }, [creator.id, params?.groupId])

  const ante = getAnte(outcomeType, answers.length, visibility === 'private')

  // If params.closeTime is set, extract out the specified date and time
  // By default, close the question a week from today
  const weekFromToday = dayjs().add(7, 'day').format('YYYY-MM-DD')
  const timeInMs = Number(params?.closeTime ?? 0)
  const initDate = timeInMs
    ? dayjs(timeInMs).format('YYYY-MM-DD')
    : weekFromToday
  const initTime = timeInMs ? dayjs(timeInMs).format('HH:mm') : '23:59'

  const [closeDate, setCloseDate] = usePersistentLocalState<undefined | string>(
    timeInMs ? initDate : undefined,
    'now-close-date' + paramsKey
  )
  const [closeHoursMinutes, setCloseHoursMinutes] = usePersistentLocalState<
    string | undefined
  >(timeInMs ? initTime : undefined, 'now-close-time' + paramsKey)

  const [selectedGroup, setSelectedGroup] = usePersistentLocalState<
    Group | undefined
  >(undefined, 'new-selected-group' + paramsKey)

  const [bountyAmount, setBountyAmount] = usePersistentLocalState<
    number | undefined
  >(50, 'new-bounty' + paramsKey)

  const closeTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  const balance = creator.balance || 0

  const min = minString ? parseFloat(minString) : undefined
  const max = maxString ? parseFloat(maxString) : undefined
  const initialValue = initialValueString
    ? parseFloat(initialValueString)
    : undefined

  useEffect(() => {
    if (outcomeType === 'STONK' || NON_BETTING_OUTCOMES.includes(outcomeType)) {
      setCloseDate(dayjs().add(1000, 'year').format('YYYY-MM-DD'))
      setCloseHoursMinutes('23:59')

      if (outcomeType == 'STONK') {
        if (editor?.isEmpty) {
          editor?.commands.setContent(
            generateJSON(
              `<div>
            ${STONK_YES}: good<br/>${STONK_NO}: bad<br/>Question trades based on sentiment & never
            resolves.
          </div>`,
              extensions
            )
          )
        }
      }
    }
  }, [outcomeType])

  const isValidMultipleChoice = answers.every(
    (answer) => answer.trim().length > 0
  )

  const isValid =
    question.length > 0 &&
    ante !== undefined &&
    ante !== null &&
    ante <= balance &&
    // closeTime must be in the future
    (closeTime ?? Infinity) > Date.now() &&
    (outcomeType !== 'PSEUDO_NUMERIC' ||
      (min !== undefined &&
        max !== undefined &&
        initialValue !== undefined &&
        isFinite(min) &&
        isFinite(max) &&
        min < max &&
        max - min > 0.01 &&
        min < initialValue &&
        initialValue < max)) &&
    (outcomeType !== 'MULTIPLE_CHOICE' || isValidMultipleChoice)

  const [errorText, setErrorText] = useState<string>('')
  useEffect(() => {
    setErrorText('')
  }, [isValid])

  const editor = useTextEditor({
    key: 'create market' + paramsKey,
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: descriptionPlaceholder,
    defaultValue: params?.description
      ? JSON.parse(params.description)
      : undefined,
  })

  function setCloseDateInDays(days: number) {
    const newCloseDate = dayjs().add(days, 'day').format('YYYY-MM-DD')
    setCloseDate(newCloseDate)
  }

  const resetProperties = () => {
    editor?.commands.clearContent(true)
    safeLocalStorage?.removeItem(`text create market`)
    setQuestion('')
    setCloseDate(undefined)
    setCloseHoursMinutes(undefined)
    setSelectedGroup(undefined)
    setVisibility((params?.visibility as Visibility) ?? 'public')
    setAnswers(['', '', ''])
    setMinString('')
    setMaxString('')
    setInitialValueString('')
    setIsLogScale(false)
    setBountyAmount(50)
  }

  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit() {
    if (!isValid) return
    setIsSubmitting(true)
    try {
      const newContract = (await createMarket(
        removeUndefinedProps({
          question,
          outcomeType,
          description: editor?.getJSON(),
          initialProb: 50,
          ante,
          closeTime,
          min,
          max,
          initialValue,
          isLogScale,
          answers,
          groupId: selectedGroup?.id,
          visibility,
          utcOffset: new Date().getTimezoneOffset(),
          totalBounty: bountyAmount,
        })
      )) as Contract

      setNewContract(newContract)
      resetProperties()

      track('create market', {
        slug: newContract.slug,
        selectedGroup: selectedGroup?.id,
        outcomeType,
      })
    } catch (e) {
      console.error('error creating contract', e)
      setErrorText((e as any).message || 'Error creating contract')
      setIsSubmitting(false)
    }
  }
  return {
    question,
    setQuestion,
    editor,
    closeDate,
    setCloseDate,
    closeHoursMinutes,
    setCloseHoursMinutes,
    setCloseDateInDays,
    min,
    minString,
    setMinString,
    max,
    maxString,
    setMaxString,
    initialValue,
    initialValueString,
    setInitialValueString,
    isLogScale,
    setIsLogScale,
    answers,
    setAnswers,
    selectedGroup,
    setSelectedGroup,
    visibility,
    setVisibility,
    initTime,
    submit,
    isValid,
    isSubmitting,
    errorText,
    balance,
    ante,
    newContract,
    bountyAmount,
    setBountyAmount,
  }
}
