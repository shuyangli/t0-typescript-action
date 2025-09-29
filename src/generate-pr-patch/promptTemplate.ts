import Handlebars from 'handlebars'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { type PrPatchPromptContext } from './types.js'

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read the prompt template from the external file
const prPatchTemplateSource = readFileSync(
  join(__dirname, 'prompt.txt'),
  'utf8'
)

const prPatchTemplate = Handlebars.compile<PrPatchPromptContext>(
  prPatchTemplateSource.trim()
)

export function renderPrPatchPrompt(context: PrPatchPromptContext): string {
  return prPatchTemplate(context).trim()
}

export function extractCommentsFromLlmResponse(response: string): string {
  const comments = response.match(/<comments>(.*?)<\/comments>/s)
  return comments ? comments[1] : ''
}

export function extractDiffFromLlmResponse(response: string): string {
  const diff = response.match(/<diff>(.*?)<\/diff>/s)
  return diff ? diff[1] : ''
}
