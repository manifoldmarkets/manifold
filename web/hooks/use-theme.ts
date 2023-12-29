'use client'
import { useEffect } from 'react'
import { postMessageToNative } from 'web/lib/native/post-message'
import { usePersistentLocalState } from './use-persistent-local-state'

type theme_option = 'light' | 'dark' | 'auto'

export const useTheme = () => {
  const [themeState, setThemeState] = usePersistentLocalState<
    theme_option | 'loading'
  >('loading', 'theme')

  const setTheme = (theme: theme_option) => {
    setThemeState(theme)
    reRenderTheme()
  }

  return { theme: themeState, setTheme }
}

export const useThemeManager = () => {
  useEffect(() => {
    reRenderTheme()

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    darkQuery.addEventListener('change', reRenderTheme)
    return () => darkQuery.removeEventListener('change', reRenderTheme)
  }, [])
}

const reRenderTheme = () => {
  const theme: theme_option =
    JSON.parse(localStorage.getItem('theme') ?? 'null') ?? 'auto'

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
}
