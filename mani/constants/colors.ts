/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

export function hexToRgb(hex: string) {
  // Remove # if present
  hex = hex.replace('#', '')

  // Parse the hex values
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  return { r, g, b }
}

export const withOpacity = (hexColor: string, opacity: number) => {
  return (
    hexColor +
    Math.round(opacity * 255)
      .toString(16)
      .padStart(2, '0')
  )
}

export const gray = {
  50: '#fafafa',
  100: '#f4f4f5',
  200: '#e4e4e7',
  300: '#d4d4d8',
  400: '#a1a1aa',
  500: '#71717a',
  600: '#52525b',
  700: '#3f3f46',
  800: '#27272a',
  900: '#18181b',
  950: '#09090b',
} as const

// Tailwind emerald colors
export const emerald = {
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

export const blue = {
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

export const pink = {
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

export const purple = {
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

export const red = {
  50: '#ffebee',
  100: '#ffcdd2',
  200: '#ef9a9a',
  300: '#e57373',
  400: '#ef5350',
  500: '#f44336',
  600: '#e53935',
  700: '#d32f2f',
  800: '#c62828',
  900: '#b71c1c',
}

export const amber = {
  50: '#fff8e1',
  100: '#ffecb3',
  200: '#ffe082',
  300: '#ffd54f',
  400: '#ffca28',
  500: '#ffc107',
  600: '#ffb300',
  700: '#ffa000',
  800: '#ff8f00',
  900: '#ff6f00',
}

export const indigo = {
  50: '#e8eaf6',
  100: '#c5cae9',
  200: '#9fa8da',
  300: '#7986cb',
  400: '#5c6bc0',
  500: '#3f51b5',
  600: '#3949ab',
  700: '#303f9f',
  800: '#283593',
  900: '#1a237e',
} as const

export const teal = {
  50: '#e0f2f1',
  100: '#b2dfdb',
  200: '#80cbc4',
  300: '#4db6ac',
  400: '#26a69a',
  500: '#009688',
  600: '#00897b',
  700: '#00796b',
  800: '#00695c',
  900: '#004d40',
} as const

export const yellow = {
  50: '#fffde7',
  100: '#fff9c4',
  200: '#fff59d',
  300: '#fff176',
  400: '#ffee58',
  500: '#ffeb3b',
  600: '#fdd835',
  700: '#fbc02d',
  800: '#f9a825',
  900: '#f57f17',
} as const

export const white = '#FFFFFF'

// Mode-specific colors
export const modes = {
  MANA: {
    primary: purple[300],
    sliderBackground: purple[500],
    primaryButton: purple[600],
  },
  CASH: {
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
  textQuaternary: gray[500],
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
  errorBackground: withOpacity(red[500], 0.2),
  error: red[500],
  blue: blue[500],
  profitText: emerald[400],
  modalOverlay: withOpacity(gray[950], 0.9),
} as const

// Mode-specific colors (used for game modes)
export const ModeColors = modes
