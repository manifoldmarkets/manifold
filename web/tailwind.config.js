/* eslint-disable @typescript-eslint/no-var-requires */
const defaultTheme = require('tailwindcss/defaultTheme')
const plugin = require('tailwindcss/plugin')

module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    fontFamily: Object.assign(
      { ...defaultTheme.fontFamily },
      {
        'major-mono': ['Major Mono Display', 'monospace'],
        'readex-pro': [
          'Readex Pro',
          'AppleColorEmoji',
          'Segoe UI Emoji',
          'Noto Color Emoji',
          'sans-serif',
        ],
      }
    ),
    extend: {
      transitionTimingFunction: {
        bouncy: 'cubic-bezier(0.8, 0, 1, 1)',
      },
      keyframes: {
        'bounce-left': {
          '0%,100%': {
            transform: 'translateX(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '50%': {
            transform: 'translateX(-15%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'bounce-right': {
          '0%,100%': {
            transform: 'translateX(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '50%': {
            transform: 'translateX(15%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
      },
      animation: {
        'bounce-left': 'bounce-left 0.8s infinite',
        'bounce-right': 'bounce-right 0.7s infinite',
      },
      colors: {
        warning: '#F59E0B', // amber-500 TODO: change color
        error: '#FF5033', // TODO: change color
        'red-25': '#FDF7F6',
        'greyscale-1': '#FBFBFF',
        'greyscale-1.5': '#F4F4FB',
        'greyscale-2': '#E7E7F4',
        'greyscale-3': '#D8D8EB',
        'greyscale-4': '#B1B1C7',
        'greyscale-5': '#9191A7',
        'greyscale-6': '#66667C',
        'greyscale-7': '#111140',
        'highlight-blue': '#5BCEFF',
        'hover-blue': '#90DEFF',
        scarlet: {
          50: '#ffece9',
          100: '#FFD3CC',
          200: '#FFA799',
          300: '#FF7C66',
          400: '#FF5033',
          500: '#FF2400',
          600: '#CC1D00',
          700: '#991600',
          800: '#660E00',
          900: '#330700',
        },
      },
      typography: {
        quoteless: {
          css: {
            'blockquote p:first-of-type::before': { content: 'none' },
            'blockquote p:first-of-type::after': { content: 'none' },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/line-clamp'),
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          /* IE and Edge */
          '-ms-overflow-style': 'none',

          /* Firefox */
          'scrollbar-width': 'none',

          /* Safari and Chrome */
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
        '.break-anywhere': {
          'overflow-wrap': 'anywhere',
          'word-break': 'break-word', // for Safari
        },
      })
    }),
  ],
}
