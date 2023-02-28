import { createContext } from 'react'

const defaultValue = {
  currentTheme: 'light',
  changeCurrentTheme: (newTheme: 'light' | 'dark') => {},
}

const ThemeContext = createContext(defaultValue)

export default ThemeContext
