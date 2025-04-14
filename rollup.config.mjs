import fs from 'node:fs/promises'
import dts from 'rollup-plugin-dts'

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

export default [
  // Output for Typescript's .d.ts
  bundle({
    plugins: [dts()],
    output: {
      file: `${distOutputPath}.d.ts`,
      format: 'es',
    },
  }),
]
