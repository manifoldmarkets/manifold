import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Contract } from 'common/contract'

type Draft = {
  text: string
  markets: Contract[]
  images: string[]
  localImages: Map<string, { file: File; uploadedUrl?: string }>
  submitting: { current: boolean }
  saving: boolean
  uploading: boolean
  error?: string
}
type Drafts = Record<string, Draft>

const ReplyDraftContext = createContext<{
  drafts: Drafts
  setDrafts: Dispatch<SetStateAction<Drafts>>
} | null>(null)

function releaseImages(draft: Draft) {
  for (const url of draft.localImages.keys()) URL.revokeObjectURL(url)
  draft.localImages.clear()
}

// The thread owns reply drafts, so replacing preview cards with the full reply
// list does not discard text or pending uploads. Leaving the thread releases them.
export function SocialReplyDraftProvider({
  children,
}: {
  children: ReactNode
}) {
  const [drafts, setDrafts] = useState<Drafts>({})
  const latest = useRef(drafts)
  useEffect(() => {
    latest.current = drafts
  }, [drafts])
  useEffect(
    () => () => Object.values(latest.current).forEach(releaseImages),
    []
  )
  return (
    <ReplyDraftContext.Provider value={{ drafts, setDrafts }}>
      {children}
    </ReplyDraftContext.Provider>
  )
}

export const useReplyDraftContext = () => useContext(ReplyDraftContext)

export function useSocialComposerDraft(
  initial: Pick<Draft, 'text' | 'markets' | 'images'>,
  parentId?: string
) {
  const context = useReplyDraftContext()
  const shared = parentId && context ? context : null
  const [local, setLocal] = useState<Draft>(() => ({
    ...initial,
    localImages: new Map(),
    submitting: { current: false },
    saving: false,
    uploading: false,
  }))
  const draft = (parentId && shared?.drafts[parentId]) || local
  useEffect(() => {
    if (!shared) return () => releaseImages(local)
  }, [!!shared, local.localImages])
  const setDraft: Dispatch<SetStateAction<Draft>> = (update) => {
    if (shared && parentId) {
      shared.setDrafts((drafts) => ({
        ...drafts,
        [parentId]:
          typeof update === 'function'
            ? update(drafts[parentId] ?? local)
            : update,
      }))
    } else setLocal(update)
  }
  function setField<K extends keyof Draft>(
    key: K,
    value: SetStateAction<Draft[K]>
  ) {
    setDraft((previous) => ({
      ...previous,
      [key]: typeof value === 'function' ? value(previous[key]) : value,
    }))
  }
  function clear() {
    releaseImages(draft)
    setDraft({ ...local, text: '', markets: [], images: [], error: undefined })
  }
  return { draft, setField, clear }
}
