import { useEffect } from 'react'
import { DarkModeContext, theme_option } from 'web/hooks/dark-mode-context'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { postMessageToNative } from './native-message-listener'

export const DarkModeProvider = (props: { children: any }) => {
  const [theme, changeTheme] = usePersistentState<theme_option>('auto', {
    key: 'theme',
    store: storageStore(safeLocalStorage),
  })
  //init theme state. TODO: fix/replace usePersistentState to do this
  useEffect(() => {
    safeLocalStorage &&
      changeTheme(JSON.parse(safeLocalStorage.getItem('theme') as any))
  }, [])

  const reRenderTheme = () => {
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
  }

  useEffect(reRenderTheme, [theme])

  useEffect(() => {
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    darkQuery.addEventListener('change', reRenderTheme)
    return () => darkQuery.removeEventListener('change', reRenderTheme)
  }, [])

  return (
    <DarkModeContext.Provider value={{ theme, changeTheme }}>
      {props.children}
    </DarkModeContext.Provider>
  )
}
