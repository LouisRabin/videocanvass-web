import { mergeConfig, type ConfigEnv, type UserConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import viteConfigExport from './vite.config'

const viteEnv: ConfigEnv = { command: 'serve', mode: 'test' }
const viteBase: UserConfig =
  typeof viteConfigExport === 'function'
    ? (viteConfigExport as (env: ConfigEnv) => UserConfig)(viteEnv)
    : viteConfigExport

export default mergeConfig(
  viteBase,
  defineConfig({
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      passWithNoTests: false,
    },
  }),
)
