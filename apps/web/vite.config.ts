import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    base: env.BASE_PATH || '/',
    plugins: [svelte()],
    server: {
      fs: {
        allow: ['../..'],
      },
    },
  }
})
