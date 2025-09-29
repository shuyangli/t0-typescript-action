// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import { copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const createConfig = (actionName) => {
  const plugins = [
    typescript(),
    nodeResolve({ preferBuiltins: true }),
    commonjs()
  ]

  // Add custom plugin to copy prompt file for generate-pr-patch
  if (actionName === 'generate-pr-patch') {
    plugins.push({
      name: 'copy-prompt-file',
      writeBundle() {
        const srcPath = 'src/generate-pr-patch/prompt.txt'
        const destDir = 'dist/generate-pr-patch'
        const destPath = join(destDir, 'prompt.txt')

        mkdirSync(destDir, { recursive: true })
        copyFileSync(srcPath, destPath)
      }
    })
  }

  // Add custom plugin to copy tensorzero.toml for both actions
  plugins.push({
    name: 'copy-tensorzero-config',
    writeBundle() {
      const srcPath = 'tensorzero.toml'
      const destDir = `dist/${actionName}`
      const destPath = join(destDir, 'tensorzero.toml')

      mkdirSync(destDir, { recursive: true })
      copyFileSync(srcPath, destPath)
    }
  })

  return {
    input: `src/${actionName}/index.ts`,
    output: {
      esModule: true,
      file: `dist/${actionName}/index.js`,
      format: 'es',
      sourcemap: true
    },
    plugins
  }
}

export default [
  createConfig('generate-pr-patch'),
  createConfig('create-pr-feedback')
]
