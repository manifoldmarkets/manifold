import { createContext } from 'react'

export type theme_option = 'light' | 'dark' | 'auto'

export interface DarkModeContextProps {
  theme: theme_option
  changeTheme: (newTheme: theme_option) => void
}

export const DarkModeContext = createContext<DarkModeContextProps>({
  theme: 'auto',
  changeTheme: () => {},
})
