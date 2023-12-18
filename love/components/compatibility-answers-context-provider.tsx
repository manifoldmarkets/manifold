import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Row as rowFor } from 'common/supabase/utils'
import { API } from 'common/api/schema'
import CompatibilityAnswersContext from 'love/hooks/compatibility-answers-context'

export const CompatibilityAnswersContextProvider = (props: {
  children: any
}) => {
  const [yourAnswers, setYourAnswers] = usePersistentInMemoryState<
    rowFor<'love_compatibility_answers'>[] | undefined | null
  >(undefined, 'your-compatibility-answers')

  const [yourCompatibleLovers, setYourCompatibleLovers] =
    usePersistentInMemoryState<
      (typeof API)['compatible-lovers']['returns'] | undefined | null
    >(undefined, 'your-compatibility-answers')

  return (
    <CompatibilityAnswersContext.Provider
      value={{
        yourAnswers,
        setYourAnswers,
        yourCompatibleLovers,
        setYourCompatibleLovers,
      }}
    >
      {props.children}
    </CompatibilityAnswersContext.Provider>
  )
}
