/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const withOpacity = (hexColor: string, opacity: number) => {
  return (
    hexColor +
    Math.round(opacity * 255)
      .toString(16)
      .padStart(2, '0')
  )
}

const gray = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
  950: '#020617',
} as const

// Tailwind emerald colors
const emerald = {
  50: '#ECFDF5',
  100: '#D1FAE5',
  200: '#A7F3D0',
  300: '#6EE7B7',
  400: '#34D399',
  500: '#10B981',
  600: '#059669',
  700: '#047857',
  800: '#065F46',
  900: '#064E3B',
} as const

const blue = {
  50: '#eff6ff',
  100: '#dbeafe',
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
  900: '#1e3a8a',
}

const pink = {
  50: '#fdf2f8',
  100: '#fce7f3',
  200: '#fbcfe8',
  300: '#f9a8d4',
  400: '#f472b6',
  500: '#ec4899',
  600: '#db2777',
  700: '#be185d',
  800: '#9d174d',
  900: '#831843',
}

const purple = {
  50: '#FAF6FE',
  100: '#F3EAFD',
  200: '#E7D9FB',
  300: '#C8A6F4',
  400: '#BB90F0',
  500: '#9B5DE5',
  600: '#8A46D7',
  700: '#7534BC',
  800: '#642F9A',
  900: '#52277C',
  950: '#36115A',
} as const

const red = {
  500: '#FF0000',
}

const white = '#FFFFFF'

// Mode-specific colors
export const modes = {
  play: {
    primary: purple[300],
    sliderBackground: purple[500],
    primaryButton: purple[600],
  },
  sweep: {
    primary: emerald[300],
    sliderBackground: emerald[500],
    primaryButton: emerald[600],
  },
} as const

// Theme colors (used for UI components)
export const Colors = {
  text: white,
  textSecondary: gray[300],
  textTertiary: gray[400],
  background: gray[950],
  backgroundSecondary: gray[900],
  grayButtonBackground: gray[800],
  icon: gray[400],
  border: gray[800],
  borderSecondary: gray[700],
  yesButtonBackground: withOpacity(blue[500], 0.2),
  yesButtonText: blue[400],
  noButtonBackground: withOpacity(pink[600], 0.2),
  noButtonText: pink[500],
  dangerButtonBackground: withOpacity(red[500], 0.2),
  dangerButtonText: red[500],
  blue: blue[500],
  profitText: emerald[400],
  modalOverlay: withOpacity(gray[950], 0.9),
} as const

// Mode-specific colors (used for game modes)
export const ModeColors = modes
