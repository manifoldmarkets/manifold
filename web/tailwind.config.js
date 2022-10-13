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
        'readex-pro': ['Readex Pro', 'sans-serif'],
      }
    ),
    extend: {
      colors: {
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
    require('daisyui'),
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
  daisyui: {
    themes: [
      {
        mantic: {
          primary: '#11b981',
          'primary-focus': '#069668',
          // Foreground content color to use on primary color
          'primary-content': '#ffffff',

          secondary: '#a991f7',
          'secondary-focus': '#8462f4',
          // Foreground content color to use on secondary color
          'secondary-content': '#ffffff',

          accent: '#f6d860',
          'accent-focus': '#f3cc30',
          // Foreground content color to use on accent color
          'accent-content': '#ffffff',

          neutral: '#3d4451',
          'neutral-focus': '#2a2e37',
          // Foreground content color to use on neutral color
          'neutral-content': '#ffffff',

          'base-100': '#ffffff' /* Base page color, for blank backgrounds */,
          'base-200': '#f9fafb' /* Base color, a little darker */,
          'base-300': '#d1d5db' /* Base color, even more dark */,
          // Foreground content color to use on base color
          'base-content': '#1f2937',

          info: '#2094f3',
          success: '#009485',
          warning: '#ff9900',
          error: '#ff5724',
        },
      },
    ],
  },
}
