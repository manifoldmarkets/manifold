import { defineConfig } from 'vite'
import { transform } from 'windicss/helpers'

export default defineConfig({
  plugins: [transform('daisyui')],
})
