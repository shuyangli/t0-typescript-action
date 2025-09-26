import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  CreatePrFeedbackActionInput,
  TensorZeroFeedbackRequest
} from './types.js'
import { getPullRequestToInferenceRecord } from '../clickhouse-utils/clickhouseClient.js'
import { PullRequestToInferenceRecord } from '../clickhouse-utils/clickhouseTypes.js'

function parseAndValidateActionInputs(): CreatePrFeedbackActionInput {
  const inputs: CreatePrFeedbackActionInput = {
    tensorZeroBaseUrl: core.getInput('tensorzero-base-url')?.trim(),
    clickhouseUrl: core.getInput('clickhouse-url')?.trim(),
    clickhouseTable: core.getInput('clickhouse-table')?.trim()
  }
  if (!inputs.tensorZeroBaseUrl) {
    throw new Error(
      'TensorZero base url is required; provide one via the `tensorzero-base-url` input.'
    )
  }
  if (!inputs.clickhouseUrl) {
    throw new Error(
      'ClickHouse URL is required; provide one via the `clickhouse-url` input.'
    )
  }
  if (!inputs.clickhouseTable) {
    throw new Error(
      'ClickHouse Table is required; provide one via the `clickhouse-table` input.'
    )
  }
  return inputs
}

function isPullRequestEligibleForFeedback(
  inferenceRecords: PullRequestToInferenceRecord[]
): boolean {
  const pullRequestState = github.context.payload.pull_request?.state
  if (!pullRequestState) {
    core.warning(`Pull Request State is not set. Skipping action.`)
    return false
  } else if (pullRequestState !== 'closed') {
    core.warning(`Pull Request is not closed. Skipping action.`)
    return false
  }
  if (github.context.payload.pull_request?.number === undefined) {
    core.warning(`Pull Request Number is not set. Skipping action.`)
    return false
  }
  if (inferenceRecords.length === 0) {
    core.warning(
      `Pull request doesn't have any inference records. Skipping action.`
    )
    return false
  }
  if (inferenceRecords.length > 1) {
    core.warning(
      `Pull request has multiple inference records. This might indicate an issue but we will proceed and provide feedback on all of them.`
    )
  }
  core.info(`Pull Request State: ${pullRequestState}`)
  return true
}

async function provideFeedback(
  tensorZeroBaseUrl: string,
  inferenceId: string,
  isPullRequestMerged: boolean
): Promise<void> {
  const feedbackUrl = `${tensorZeroBaseUrl}/feedback`
  const feedbackRequest: TensorZeroFeedbackRequest<boolean> = {
    metric_name: 'tensorzero_github_ci_bot_pr_merged',
    inference_id: inferenceId,
    value: isPullRequestMerged
  }
  const response = await fetch(feedbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(feedbackRequest)
  })
  if (!response.ok) {
    throw new Error(`Failed to provide feedback: ${response.statusText}`)
  }
  return
}

export async function run(): Promise<void> {
  const inputs = parseAndValidateActionInputs()
  const { tensorZeroBaseUrl } = inputs

  const pullRequestId = github.context.payload.pull_request?.id
  if (!pullRequestId) {
    throw new Error('Did not receive a pull request ID from the context.')
  }
  core.info(
    `Handling Pull Request ID ${pullRequestId} (#${github.context.payload.pull_request?.number}).`
  )

  // const githubToken = process.env.GITHUB_TOKEN
  // if (!githubToken) {
  //   throw new Error(`GITHUB_TOKEN is not set. Skipping action.`)
  // }
  // const octokit = github.getOctokit(githubToken)
  // // Checked above
  // const pullRequestNumber = github.context.payload.pull_request
  //   ?.number as number

  // const pullRequestMergedResponse = await octokit.rest.pulls.checkIfMerged({
  //   owner: github.context.payload.pull_request?.head.repo.owner,
  //   repo: github.context.payload.pull_request?.head.repo.name,
  //   pull_number: pullRequestNumber
  // })
  const isPullRequestMerged =
    (github.context.payload.pull_request?.merged as boolean) ?? false // pullRequestMergedResponse.status === 204

  const inferenceRecords = await getPullRequestToInferenceRecord(pullRequestId)
  if (!isPullRequestEligibleForFeedback(inferenceRecords)) {
    return
  }

  // Provide feedback
  await Promise.all(
    inferenceRecords.map(async (record) => {
      await provideFeedback(
        tensorZeroBaseUrl,
        record.inferenceId,
        isPullRequestMerged
      )
      core.info(
        `Feedback (${isPullRequestMerged}) provided for inference ${record.inferenceId}`
      )
    })
  )
}
