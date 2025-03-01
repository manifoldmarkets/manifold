'use client'
import { postMessageToNative } from 'web/lib/native/post-message'
import { usePersistentLocalState } from './use-persistent-local-state'
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useCallback,
} from 'react'

type theme_option = 'light' | 'dark' | 'auto'

interface ThemeContextType {
  theme: theme_option
  setTheme: (theme: theme_option) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// NOTE: If you change anything about how this works, make sure init-theme.js is also changed.
// Here is how the theme works on a fresh load.
// 1. HTML is sent to the client. An inline <style> sets background & text based on system theme
// 2. A render-blocking <script> grabs the user preference out of localStorage, and sets "dark" class accordingly
// 3. Stuff is rendered. React hooks run. User can now change the theme.
//
// Without 1, there is a flash of light theme before the tailwind stylesheet loads.
// Without 2, there is a flash of light theme when tailwind stylesheet loads, before the react hooks run.

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeState, setThemeState] = usePersistentLocalState<theme_option>(
    'auto',
    'theme'
  )

  const reRenderTheme = useCallback(() => {
    const theme = themeState
    const autoDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    if (theme === 'dark' || (theme === 'auto' && autoDark)) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    // pass theme to app
    const element = document.querySelector('.bg-canvas-0')
    if (element === null) return
    const con = getComputedStyle(element).getPropertyValue('--color-canvas-0')
    const color = `rgba(${con.replaceAll(' ', ',')}, 1)`
    postMessageToNative('theme', {
      theme: theme,
      backgroundColor: color,
    })
  }, [themeState])

  // Handle system theme changes
  useEffect(() => {
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    darkQuery.addEventListener('change', reRenderTheme)
    return () => darkQuery.removeEventListener('change', reRenderTheme)
  }, [reRenderTheme])

  // Handle theme changes
  useEffect(() => {
    reRenderTheme()
  }, [reRenderTheme])

  const setTheme = useCallback(
    (theme: theme_option) => {
      setThemeState(theme)
    },
    [setThemeState]
  )

  return (
    <ThemeContext.Provider value={{ theme: themeState, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
