import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { OmniSearch } from './search'
import { Modal } from '../layout/modal'

// context for opening modal

interface SearchContextInterface {
  setOpen: (open: boolean) => void
  open: boolean
}

const SearchCtx = createContext<SearchContextInterface | null>(null)

export const SearchProvider = (props: { children: ReactNode }) => {
  const { children } = props
  const [open, setOpen] = useState(false)

  useEffect(() => {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        setOpen(true)
        e.preventDefault()
      }
    })
  }, [])

  return (
    <SearchCtx.Provider value={{ open, setOpen }}>
      <Modal
        open={open}
        setOpen={setOpen}
        size="lg"
        className="sm:mt-[15vh]"
        position="top"
      >
        <OmniSearch className="max-h-[70vh] overflow-hidden rounded-2xl" />
      </Modal>
      {children}
    </SearchCtx.Provider>
  )
}

export function useSearchContext() {
  return useContext(SearchCtx)
}
