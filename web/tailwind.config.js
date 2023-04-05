/* eslint-disable @typescript-eslint/no-var-requires */
const defaultTheme = require('tailwindcss/defaultTheme')
const plugin = require('tailwindcss/plugin')

module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    fontFamily: Object.assign(
      { ...defaultTheme.fontFamily },
      {
        'major-mono': ['var(--font-logo)', 'monospace'],
        'readex-pro': ['icomoon', 'Helvetica', 'emoji', 'sans-serif'],
        'grenze-gotisch': ['var(--font-match-cards)', 'cursive'], // just for match card game
      }
    ),
    extend: {
      fontFamily: {
        mana: ['icomoon'],
      },
      transitionTimingFunction: {
        bouncy: 'cubic-bezier(0.8, 0, 1, 1)',
      },
      keyframes: {
        progress: {
          from: {
            width: '0%',
          },
          to: {
            width: '100%',
          },
        },
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
        'slide-in-1': {
          '0%': {
            transform: 'translateX(-100%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '19.5%': {
            transform: 'translateX(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-in-2': {
          '0%': {
            transform: 'translateX(-100%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '20%': {
            transform: 'translateX(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-in-3': {
          '0%,30%': {
            transform: 'translateX(-150%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '60%': {
            transform: 'translateX(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-in-4': {
          '0%,31%': {
            transform: 'translateX(-150%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '61%': {
            transform: 'translateX(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-up-1': {
          '0%': {
            transform: 'translateY(200%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '19.5%': {
            transform: 'translateY(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-up-2': {
          '0%': {
            transform: 'translateY(200%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '20%': {
            transform: 'translateY(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-up-3': {
          '0%,30%': {
            transform: 'translateY(200%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '60%': {
            transform: 'translateY(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-up-4': {
          '0%,31%': {
            transform: 'translateY(200%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '61%': {
            transform: 'translateY(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-up-3-big': {
          '0%,30%': {
            transform: 'translateY(500%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '60%': {
            transform: 'translateY(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-up-4-big': {
          '0%,31%': {
            transform: 'translateY(500%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '61%': {
            transform: 'translateY(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'press-3x': {
          '0%,60%,70%,80%,100%': {
            transform: 'translateX(0%) translateY(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '65%,75%,85%': {
            transform: 'translateX(10%) translateY(10%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'float-and-fade-1': {
          '0%,64%': {
            opacity: 0,
          },
          '65%': {
            transform: 'translateY(0%)',
            opacity: 1,
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '80%,100%': {
            transform: 'translateY(-150%)',
            opacity: 0,
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'float-and-fade-2': {
          '0%,74%': {
            opacity: 0,
          },
          '75%': {
            transform: 'translateY(0%)',
            opacity: 1,
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '90%,100%': {
            transform: 'translateY(-150%)',
            opacity: 0,
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'float-and-fade-3': {
          '0%,84%': {
            opacity: 0,
          },
          '85%': {
            transform: 'translateY(0%)',
            opacity: 1,
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '100%': {
            transform: 'translateY(-150%)',
            opacity: 0,
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-in-4-grow': {
          '0%,31%': {
            transform: 'translateX(-250%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '61%': {
            transform: 'translateX(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '80%': {
            transform: 'scale(120%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '65%,95%,100%': {
            transform: 'scale(100%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
        'slide-up-3-grow': {
          '0%,30%': {
            transform: 'translateY(100%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '60%': {
            transform: 'translateY(0%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '80%': {
            transform: 'scale(120%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '65%,95%,100%': {
            transform: 'scale(100%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
        },
      },
      animation: {
        progress: 'progress linear forwards',
        'bounce-left': 'bounce-left 0.8s',
        'bounce-right': 'bounce-right 0.7s',
        'slide-in-1': 'slide-in-1 4s',
        'slide-in-2': 'slide-in-2 4s',
        'slide-in-3': 'slide-in-3 4s',
        'slide-in-4': 'slide-in-4 4s',
        'slide-up-1': 'slide-up-1 4s',
        'slide-up-2': 'slide-up-2 4s',
        'slide-up-3': 'slide-up-3 4s',
        'slide-up-4': 'slide-up-4 4s',
        'slide-up-3-big': 'slide-up-3-big 4s',
        'slide-up-4-big': 'slide-up-4-big 4s',
        'press-3x': 'press-3x 5s',
        'float-and-fade-1': 'float-and-fade-1 5s',
        'float-and-fade-2': 'float-and-fade-2 5s',
        'float-and-fade-3': 'float-and-fade-3 5s',
        'slide-in-4-grow': 'slide-in-4-grow 4s',
        'slide-up-3-grow': 'slide-up-3-grow 4s',
      },
      colors: {
        ink: {
          0: 'rgb(var(--color-ink-0) / <alpha-value>)',
          50: 'rgb(var(--color-ink-50) / <alpha-value>)',
          100: 'rgb(var(--color-ink-100) / <alpha-value>)',
          200: 'rgb(var(--color-ink-200) / <alpha-value>)',
          300: 'rgb(var(--color-ink-300) / <alpha-value>)',
          400: 'rgb(var(--color-ink-400) / <alpha-value>)',
          500: 'rgb(var(--color-ink-500) / <alpha-value>)',
          600: 'rgb(var(--color-ink-600) / <alpha-value>)',
          700: 'rgb(var(--color-ink-700) / <alpha-value>)',
          800: 'rgb(var(--color-ink-800) / <alpha-value>)',
          900: 'rgb(var(--color-ink-900) / <alpha-value>)',
          1000: 'rgb(var(--color-ink-1000) / <alpha-value>)',
        },
        canvas: {
          0: 'rgb(var(--color-canvas-0) / <alpha-value>)',
          50: 'rgb(var(--color-canvas-50) / <alpha-value>)',
          100: 'rgb(var(--color-canvas-100) / <alpha-value>)',
        },
        primary: {
          50: 'rgb(var(--color-primary-50)/ <alpha-value>)',
          100: 'rgb(var(--color-primary-100)/ <alpha-value>)',
          200: 'rgb(var(--color-primary-200)/ <alpha-value>)',
          300: 'rgb(var(--color-primary-300)/ <alpha-value>)',
          400: 'rgb(var(--color-primary-400)/ <alpha-value>)',
          500: 'rgb(var(--color-primary-500)/ <alpha-value>)',
          600: 'rgb(var(--color-primary-600)/ <alpha-value>)',
          700: 'rgb(var(--color-primary-700)/ <alpha-value>)',
          800: 'rgb(var(--color-primary-800)/ <alpha-value>)',
          900: 'rgb(var(--color-primary-900)/ <alpha-value>)',
        },
        gray: {
          50: '#FBFBFF',
          100: '#F4F4FB',
          200: '#E7E7F4',
          300: '#D8D8EB',
          400: '#B1B1C7',
          500: '#9191A7',
          600: '#66667C',
          700: '#4a4a68',
          800: '#2d2d54',
          900: '#111140',
        },
        warning: '#F59E0B', // amber-500 TODO: change color
        error: '#FF5033', // TODO: change color
        'red-25': '#FDF7F6',
        'indigo-25': '#F2F7FF',
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
        DEFAULT: {
          css: {
            'blockquote p:first-of-type::before': false,
            'blockquote p:last-of-type::after': false,
            'code::before': false,
            'code::after': false,
            '--tw-prose-bold': 'inherit',
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
        '.hide-video-cast-overlay': {
          '&::-internal-media-controls-overlay-cast-button': {
            display: 'none',
          },
        },
        '.bg-confetti-animated': {
          'background-repeat': 'repeat-x',
          'background-position': 'top -10px center',
          'background-image': `url("data:image/svg+xml,%3Csvg width='600' height='90' viewBox='0 0 600 90' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='42' y='-10' width='6' height='10'/%3E%3Crect x='84' y='-10' width='6' height='10'/%3E%3Crect x='126' y='-13' width='5' height='13'/%3E%3Crect x='168' y='-13' width='5' height='13'/%3E%3Crect x='210' y='-10' width='6' height='10'/%3E%3Crect x='252' y='-13' width='5' height='13'/%3E%3Crect x='294' y='-10' width='6' height='10'/%3E%3Crect x='336' y='-13' width='5' height='13'/%3E%3Crect x='378' y='-13' width='5' height='13'/%3E%3Crect x='420' y='-10' width='6' height='10'/%3E%3Crect x='462' y='-10' width='6' height='10'/%3E%3Crect x='504' y='-13' width='5' height='13'/%3E%3Crect x='546' y='-10' width='6' height='10'/%3E%3Cstyle type='text/css'%3E rect %7B opacity: 0; %7D rect:nth-child(1) %7B transform-origin: 45px 5px; transform: rotate(-145deg); animation: blast 700ms infinite ease-out; animation-delay: 88ms; animation-duration: 631ms; %7D rect:nth-child(2) %7B transform-origin: 87px 5px; transform: rotate(164deg); animation: blast 700ms infinite ease-out; animation-delay: 131ms; animation-duration: 442ms; %7D rect:nth-child(3) %7B transform-origin: 128px 6px; transform: rotate(4deg); animation: blast 700ms infinite ease-out; animation-delay: 92ms; animation-duration: 662ms; %7D rect:nth-child(4) %7B transform-origin: 170px 6px; transform: rotate(-175deg); animation: blast 700ms infinite ease-out; animation-delay: 17ms; animation-duration: 593ms; %7D rect:nth-child(5) %7B transform-origin: 213px 5px; transform: rotate(-97deg); animation: blast 700ms infinite ease-out; animation-delay: 122ms; animation-duration: 476ms; %7D rect:nth-child(6) %7B transform-origin: 255px 6px; transform: rotate(57deg); animation: blast 700ms infinite ease-out; animation-delay: 271ms; animation-duration: 381ms; %7D rect:nth-child(7) %7B transform-origin: 297px 5px; transform: rotate(-46deg); animation: blast 700ms infinite ease-out; animation-delay: 131ms; animation-duration: 619ms; %7D rect:nth-child(8) %7B transform-origin: 338px 6px; transform: rotate(-65deg); animation: blast 700ms infinite ease-out; animation-delay: 85ms; animation-duration: 668ms; %7D rect:nth-child(9) %7B transform-origin: 380px 6px; transform: rotate(13deg); animation: blast 700ms infinite ease-out; animation-delay: 128ms; animation-duration: 377ms; %7D rect:nth-child(10) %7B transform-origin: 423px 5px; transform: rotate(176deg); animation: blast 700ms infinite ease-out; animation-delay: 311ms; animation-duration: 508ms; %7D rect:nth-child(11) %7B transform-origin: 465px 5px; transform: rotate(108deg); animation: blast 700ms infinite ease-out; animation-delay: 108ms; animation-duration: 595ms; %7D rect:nth-child(12) %7B transform-origin: 506px 6px; transform: rotate(62deg); animation: blast 700ms infinite ease-out; animation-delay: 105ms; animation-duration: 375ms; %7D rect:nth-child(13) %7B transform-origin: 549px 5px; transform: rotate(16deg); animation: blast 700ms infinite ease-out; animation-delay: 149ms; animation-duration: 491ms; %7D rect:nth-child(odd) %7B fill: %2365BB5C; %7D rect:nth-child(even) %7B z-index: 1; fill: %2333AAFF; %7D rect:nth-child(4n) %7B animation-duration: 1400ms; fill: %23F23B14; %7D rect:nth-child(3n) %7B animation-duration: 1750ms; animation-delay: 700ms; %7D rect:nth-child(4n-7) %7B fill: %232A2F6A; %7D rect:nth-child(6n) %7B fill: %23FBBA23; %7D @keyframes blast %7B from %7B opacity: 0; %7D 20%25 %7B opacity: 1; %7D to %7B transform: translateY(90px); %7D %7D %3C/style%3E%3C/svg%3E%0A");`,
        },
      })
    }),
  ],
  future: {
    hoverOnlyWhenSupported: true,
  },
}
