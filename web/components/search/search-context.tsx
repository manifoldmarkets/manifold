import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { OmniSearch } from './omni-search'
import { Modal } from '../layout/modal'
import { FullscreenConfetti } from '../widgets/fullscreen-confetti'

// context for opening modal

interface SearchContextInterface {
  setOpen: (open: boolean) => void
  open: boolean
}

const SearchCtx = createContext<SearchContextInterface | null>(null)

export const SearchProvider = (props: { children: ReactNode }) => {
  const { children } = props
  const [open, setOpen] = useState(false)
  const [confettiCount, setConfettiCount] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        setOpen(true)
        e.preventDefault()
      }
      if (e.altKey && (e.key === 'c' || e.code === 'KeyC')) {
        setConfettiCount((count) => count + 1)
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <SearchCtx.Provider value={{ open, setOpen }}>
      {Array.from({ length: confettiCount }).map((_, i) => (
        <FullscreenConfetti key={i} />
      ))}
      <Modal
        open={open}
        setOpen={setOpen}
        size="lg"
        className="sm:mt-[15vh]"
        position="top"
      >
        <OmniSearch
          className="max-h-[70vh] overflow-hidden rounded-2xl"
          query={query}
          setQuery={setQuery}
          onSelect={() => setQuery('')}
        />
      </Modal>
      {children}
    </SearchCtx.Provider>
  )
}

export function useSearchContext() {
  return useContext(SearchCtx)
}
