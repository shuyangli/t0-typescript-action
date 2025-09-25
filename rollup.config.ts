// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const createConfig = (actionName) => ({
  input: `src/${actionName}/index.ts`,
  output: {
    esModule: true,
    file: `dist/${actionName}/index.js`,
    format: 'es',
    sourcemap: true
  },
  plugins: [typescript(), nodeResolve({ preferBuiltins: true }), commonjs()]
})

export default [
  createConfig('generate-pr-patch'),
  createConfig('create-pr-feedback')
]
