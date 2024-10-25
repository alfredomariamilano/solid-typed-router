import fs from 'node:fs/promises'
import dts from 'rollup-plugin-dts'
import esbuild from 'rollup-plugin-esbuild'

const rawPackageJSON = await fs.readFile('package.json', { encoding: 'utf8' })

/** @type {import('./package.json')} */
const {
  // name, version,
  main,
} = JSON.parse(rawPackageJSON)

const distOutputPath = main.replace(/\.[cm]?js$/, '')
// const camelCaseName = name.replace(/-./g, x => x[1].toUpperCase())

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

// const esbuildPluginCommonJS = esbuild({ target: 'es6' })

// /** @type any */
// const esbuildPluginTransform = esbuildPluginCommonJS.transform

// esbuildPluginCommonJS.transform = async (/** @type {any} */ ...args) => {
//   const result = await esbuildPluginTransform(...args)

//   Object.keys(result).forEach(key => {
//     result[key] = result[key].replaceAll('@thaunknown/simple-peer/lite', 'simple-peer')
//   })

//   return result
// }

export default [
  // Output for NodeJS\
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
        file: `${distOutputPath}.js`,
        format: 'esm',
        sourcemap: false,
        compact: false,
      },
    ],
  }),

  // bundle({
  //   plugins: [esbuildPluginCommonJS],
  //   output: [
  //     {
  //       file: `${distOutputPath}.cjs`,
  //       format: 'cjs',
  //       sourcemap: false,
  //       compact: false,
  //     },
  //   ],
  // }),
  // bundle({
  //   plugins: [esbuildPlugin],
  //   output: [
  //     {
  //       file: `${distOutputPath}.js`,
  //       format: 'esm',
  //       sourcemap: false,
  //       compact: false,
  //     },
  //   ],
  // }),

  // Output for Typescript's .d.ts
  bundle({
    plugins: [dts()],
    output: {
      file: `${distOutputPath}.d.ts`,
      format: 'es',
    },
  }),

  // Output for browser
  // bundle({
  //   plugins: [esbuild({ target: 'es5', minify: true })],
  //   output: {
  //     file: `./out/${name}-v${version}.js`,
  //     format: 'iife',
  //     name: camelCaseName,
  //     sourcemap: true,
  //     compact: true,
  //   },
  // }),
]
