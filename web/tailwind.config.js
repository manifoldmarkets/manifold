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
        figtree: ['icomoon', 'var(--font-main)', 'emoji', 'sans-serif'],
        'grenze-gotisch': ['var(--font-match-cards)', 'cursive'], // just for match card game
      }
    ),
    extend: {
      minHeight: {
        screen: ['100vh /* fallback for Opera, IE and etc. */', '100dvh'],
      },
      height: {
        screen: ['100vh /* fallback for Opera, IE and etc. */', '100dvh'],
      },
      maxHeight: {
        screen: ['100vh /* fallback for Opera, IE and etc. */', '100dvh'],
      },
      gridTemplateColumns: {
        15: 'repeat(15, minmax(0, 1fr))',
        16: 'repeat(16, minmax(0, 1fr))',
      },
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
        'slide-in-from-right': {
          '0%': {
            transform: 'translateX(100%)',
            transitionTimingFunction: 'cubic-bezier(1, 1, 0.8, 0)',
          },
          '100%': {
            transform: 'translateX(0%)',
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
        'slide-in-from-right': 'slide-in-from-right 0.1s',
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
          950: 'rgb(var(--color-ink-950) / <alpha-value>)',
          1000: 'rgb(var(--color-ink-1000) / <alpha-value>)',
        },
        canvas: {
          0: 'rgb(var(--color-canvas-0) / <alpha-value>)',
          50: 'rgb(var(--color-canvas-50) / <alpha-value>)',
          100: 'rgb(var(--color-canvas-100) / <alpha-value>)',
        },
        primary: {
          50: 'rgb(var(--color-primary-50) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900) / <alpha-value>)',
          950: 'rgb(var(--color-primary-950) / <alpha-value>)',
        },
        gray: {
          50: 'hsl(240, 40%, 98%)',
          100: 'hsl(235, 46%, 95%)',
          200: 'hsl(236, 33%, 90%)',
          300: 'hsl(238, 26%, 81%)',
          400: 'hsl(238, 19%, 68%)',
          500: 'hsl(240, 12%, 52%)',
          600: 'hsl(240, 16%, 40%)',
          700: 'hsl(240, 20%, 30%)',
          800: 'hsl(240, 30%, 22%)',
          900: 'hsl(242, 45%, 15%)',
          950: 'hsl(243, 69%, 10%)',
        },
        warning: '#F0D630',
        error: '#E70D3D',
        scarlet: {
          50: 'rgb(var(--color-no-50) /  <alpha-value>)',
          100: 'rgb(var(--color-no-100) / <alpha-value>)',
          200: 'rgb(var(--color-no-200) / <alpha-value>)',
          300: 'rgb(var(--color-no-300) / <alpha-value>)',
          400: 'rgb(var(--color-no-400) / <alpha-value>)',
          500: 'rgb(var(--color-no-500) / <alpha-value>)',
          600: 'rgb(var(--color-no-600) / <alpha-value>)',
          700: 'rgb(var(--color-no-700) / <alpha-value>)',
          800: 'rgb(var(--color-no-800) / <alpha-value>)',
          900: 'rgb(var(--color-no-900) / <alpha-value>)',
          950: 'rgb(var(--color-no-950) / <alpha-value>)',
        },
        teal: {
          50: 'rgb(var(--color-yes-50) /  <alpha-value>)',
          100: 'rgb(var(--color-yes-100) / <alpha-value>)',
          200: 'rgb(var(--color-yes-200) / <alpha-value>)',
          300: 'rgb(var(--color-yes-300) / <alpha-value>)',
          400: 'rgb(var(--color-yes-400) / <alpha-value>)',
          500: 'rgb(var(--color-yes-500) / <alpha-value>)',
          600: 'rgb(var(--color-yes-600) / <alpha-value>)',
          700: 'rgb(var(--color-yes-700) / <alpha-value>)',
          800: 'rgb(var(--color-yes-800) / <alpha-value>)',
          900: 'rgb(var(--color-yes-900) / <alpha-value>)',
          950: 'rgb(var(--color-yes-950) / <alpha-value>)',
        },
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            'blockquote p:first-of-type::before': false,
            'blockquote p:last-of-type::after': false,
            'code::before': false,
            'code::after': false,
            '--tw-prose-bold': 'inherit',
            '--tw-prose-invert-bold': 'inherit',
            '--tw-prose-quote-borders': theme('colors.teal.600'),
            '--tw-prose-invert-quote-borders': theme('colors.teal.300'),
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
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
        '.date-range-input-white': {
          '&::-webkit-calendar-picker-indicator': {
            filter: 'invert(1)',
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
      })
    }),
  ],
  future: {
    hoverOnlyWhenSupported: true,
  },
}
