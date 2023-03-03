import { createContext, useContext } from 'react'

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
  return theme === 'dark'
}
