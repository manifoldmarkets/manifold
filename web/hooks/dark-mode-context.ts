import { createContext, useContext, useEffect, useState } from 'react'

export type theme_option = 'light' | 'dark' | 'auto'

export interface DarkModeContextProps {
  theme: theme_option
  changeTheme: (newTheme: theme_option) => void
}

export const DarkModeContext = createContext<DarkModeContextProps>({
  theme: 'auto',
  changeTheme: () => {},
})

export const useIsDarkMode = () => {
  const { theme } = useContext(DarkModeContext)
  // calculate system theme client-side
  const [isSystemDark, setIsSystemDark] = useState(false)
  useEffect(
    () =>
      setIsSystemDark(
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ),
    []
  )

  return theme === 'dark' || (theme === 'auto' && isSystemDark)
}
