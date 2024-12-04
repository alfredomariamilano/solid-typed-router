import fs from 'node:fs/promises'
import dts from 'rollup-plugin-dts'
import esbuild from 'rollup-plugin-esbuild'

const rawPackageJSON = await fs.readFile('package.json', { encoding: 'utf8' })

/** @type {import('./package.json')} */
const { main } = JSON.parse(rawPackageJSON)

const distOutputPath = main.replace(/\.[cm]?js$/, '')

/**
 * @param {string} id
 * @returns {boolean}
 */
const isExternal =
  process.platform === 'win32'
    ? (/** @type {string} */ id) => !/^(([a-zA-Z]{1}\:\\)|[.\\])/.test(id)
    : (/** @type {string} */ id) => !/^[./]/.test(id)

/**
 * @param {import('rollup').RollupOptions} config
 * @returns {import('rollup').RollupOptions}
 */
const bundle = config => ({
  input: './src/index.ts',
  external: isExternal,
  ...config,
})

const esbuildPlugin = esbuild({ target: 'esnext' })

export default [
  // Output for NodeJS
  bundle({
    plugins: [esbuildPlugin],
    output: [
      {
        file: `${distOutputPath}.cjs`,
        format: 'cjs',
        sourcemap: false,
        compact: false,
      },
      {
        file: `${distOutputPath}.mjs`,
        format: 'esm',
        sourcemap: false,
        compact: false,
      },
    ],
  }),
  // Output for Typescript's .d.ts
  bundle({
    plugins: [dts()],
    output: {
      file: `${distOutputPath}.d.ts`,
      format: 'es',
    },
  }),
]
