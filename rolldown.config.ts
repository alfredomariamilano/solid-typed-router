import { execSync } from 'node:child_process'
import type { RolldownOptions } from 'rolldown'
import { main } from './package.json' assert { type: 'json' }

const distOutputPath = main.replace(/\.[cm]?js$/, '')

const isExternal =
  process.platform === 'win32'
    ? (id: string) => !/^(([a-zA-Z]{1}\:\\)|[.\\])/.test(id)
    : (id: string) => !/^[./]/.test(id)

const bundle = (config: RolldownOptions): RolldownOptions => ({
  input: './src/index.ts',
  external: isExternal,
  ...config,
})

export default [
  // Output for NodeJS
  bundle({
    output: [
      {
        file: `${distOutputPath}.cjs`,
        format: 'cjs',
        sourcemap: false,
        banner: () => {
          execSync('npm run types')

          return ''
        },
        // compact: false,
      },
      {
        file: `${distOutputPath}.mjs`,
        format: 'esm',
        sourcemap: false,
        // compact: false,
      },
    ],
  }),
]
