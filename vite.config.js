import { defineConfig } from 'vite'

export default defineConfig({
  base: '/4th/',
  build: { target: 'es2020', cssMinify: true },
})
