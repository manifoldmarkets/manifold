'use client'
import { useEffect, useState } from 'react'
import { ThemeContext, theme_option } from 'web/hooks/theme-context'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

import { postMessageToNative } from 'web/lib/native/post-message'

export const ThemeProvider = (props: { children: any }) => {
  const [theme, changeTheme] = usePersistentLocalState<theme_option>(
    'auto',
    'theme'
  )
  const [isActuallyDark, setIsActuallyDark] = useState(false)

  const reRenderTheme = () => {
    const autoDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    if (theme === 'dark' || (theme === 'auto' && autoDark)) {
      document.body.classList.add('dark')
      setIsActuallyDark(true)
    } else {
      document.body.classList.remove('dark')
      setIsActuallyDark(false)
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

  useEffect(reRenderTheme, [theme])

  useEffect(() => {
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    darkQuery.addEventListener('change', reRenderTheme)
    return () => darkQuery.removeEventListener('change', reRenderTheme)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, isActuallyDark, changeTheme }}>
      {props.children}
    </ThemeContext.Provider>
  )
}
