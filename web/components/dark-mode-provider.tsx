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

  useEffect(() => {
    if (safeLocalStorage) {
      const savedTheme = safeParse(safeLocalStorage.getItem('theme'))

      const validatedTheme = ['auto', 'dark', 'light'].includes(savedTheme)
        ? savedTheme
        : 'auto'

      changeTheme(validatedTheme as theme_option)
    }
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

const safeParse = (json: any) => {
  try {
    return JSON.parse(json ?? '')
  } catch (e) {
    return null
  }
}
