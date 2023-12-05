import { createContext } from 'react'

export type theme_option = 'light' | 'dark' | 'auto'

export interface ThemeContextProps {
  theme: theme_option
  isActuallyDark: boolean
  changeTheme: (newTheme: theme_option) => void
}

export const ThemeContext = createContext<ThemeContextProps>({
  theme: 'auto',
  isActuallyDark: false,
  changeTheme: () => {},
})
