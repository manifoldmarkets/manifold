import React from 'react'
import { Row as rowFor } from 'common/supabase/utils'
import { API } from 'common/api/schema'

export interface CompatibilityAnswersContextProps {
  yourAnswers: rowFor<'love_compatibility_answers'>[] | undefined | null
  setYourAnswers: (
    yourAnswers: rowFor<'love_compatibility_answers'>[] | undefined | null
  ) => void
  yourCompatibleLovers:
    | (typeof API)['compatible-lovers']['returns']
    | undefined
    | null
  setYourCompatibleLovers: (
    yourCompatibleLovers:
      | (typeof API)['compatible-lovers']['returns']
      | undefined
      | null
  ) => void
}

const CompatibilityAnswersContext =
  React.createContext<CompatibilityAnswersContextProps>({
    yourAnswers: undefined,
    setYourAnswers: () => {},
    yourCompatibleLovers: undefined,
    setYourCompatibleLovers: () => {},
  })

export default CompatibilityAnswersContext
