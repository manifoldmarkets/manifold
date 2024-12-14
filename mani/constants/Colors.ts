/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

// Dark mode optimized grays
const gray = {
  50: '#FAFAFA',
  100: '#F4F4F5',
  200: '#E4E4E7',
  300: '#D4D4D8',
  400: '#A1A1AA',
  500: '#71717A',
  600: '#52525B',
  700: '#3F3F46',
  800: '#27272A',
  900: '#18181B',
  950: '#09090B',
} as const;

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
} as const;

// Tailwind purple colors
// const purple = {
//   50: '#FAF6FE',
//   100: '#F3EAFD',
//   200: '#E7D9FB',
//   300: '#D5BCF6',
//   400: '#BB90F0',
//   500: '#9B5DE5',
//   600: '#8A46D7',
//   700: '#7534BC',
//   800: '#642F9A',
//   900: '#52277C',
//   950: '#36115A',
// } as const;

const purple = {
  50:  '#FAF6FE',  // Kept same - lightest shade
  100: '#F3EAFD',  // Kept same
  200: '#E7D9FB',  // Kept same
  300: '#C8A6F4',  // Made darker (was D5BCF6)
  400: '#BB90F0',  // Kept same
  500: '#9B5DE5',  // Kept same
  600: '#8A46D7',  // Kept same
  700: '#7534BC',  // Kept same
  800: '#642F9A',  // Kept same
  900: '#52277C',  // Kept same
  950: '#36115A',  // Kept same
} as const;


const white = '#FFFFFF';

// Mode-specific colors
export const modes = {
  play: {
    primary: purple[300],
    sliderBackground: purple[500],
  },
  sweep: {
    primary: emerald[300],
    sliderBackground: emerald[500],
  },
} as const;

// Theme colors (used for UI components)
export const Colors = {
  text: white,
  background: gray[950],
  icon: gray[400],
  border: gray[800],
} as const;

// Mode-specific colors (used for game modes)
export const ModeColors = modes;
