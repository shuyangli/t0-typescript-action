import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

function readFeedbackFromFile(filePath: string): string {
  const resolvedPath = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Feedback file not found at path: ${resolvedPath}`)
  }

  return fs.readFileSync(resolvedPath, { encoding: 'utf-8' })
}

export async function run(): Promise<void> {
  try {
    const feedbackFromInput = core.getInput('feedback-body')?.trim()
    const feedbackFilePath = core.getInput('feedback-file')?.trim()

    let feedback = ''
    if (feedbackFilePath) {
      feedback = readFeedbackFromFile(feedbackFilePath)
    } else if (feedbackFromInput) {
      feedback = feedbackFromInput
    }

    if (!feedback) {
      core.info('No feedback provided. Skipping comment generation.')
      return
    }

    core.info('Pull request feedback prepared.')

    core.setOutput('feedback-body', feedback)

    await core.summary
      .addHeading('Prepared Pull Request Feedback')
      .addCodeBlock(feedback, 'markdown')
      .write()
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed('Unknown error occurred while creating PR feedback.')
    }
  }
}
