import { useEffect, useState } from 'react'
import { DarkModeContext, theme_option } from 'web/hooks/dark-mode-context'
import { safeLocalStorage } from 'web/lib/util/local'
import { postMessageToNative } from './native-message-listener'

export const DarkModeProvider = (props: { children: any }) => {
  const [theme, setTheme] = useState<theme_option>(
    (safeLocalStorage?.getItem('theme') || 'auto') as theme_option
  )

  const changeTheme = (newTheme: 'light' | 'dark' | 'auto') => {
    setTheme(newTheme)
    safeLocalStorage?.setItem('theme', newTheme)
  }

  useEffect(() => {
    const autoDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    if (theme === 'dark' || (theme === 'auto' && autoDark))
      document.body.classList.add('dark')
    else document.body.classList.remove('dark')

    // pass theme to app
    const element = document.querySelector('.bg-canvas-0')
    if (element === null) return
    const con = getComputedStyle(element).getPropertyValue('--color-canvas-0')
    const color = `rgba(${con.replaceAll(' ', ',')}, 1)`
    postMessageToNative('theme', {
      theme: theme,
      backgroundColor: color,
    })
  }, [theme])

  return (
    <DarkModeContext.Provider value={{ theme, changeTheme }}>
      {props.children}
    </DarkModeContext.Provider>
  )
}
