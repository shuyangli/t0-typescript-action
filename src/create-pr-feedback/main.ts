import * as core from '@actions/core'
import * as github from '@actions/github'
import { CreatePrFeedbackActionInput } from './types.js'
import {
  type PullRequestToInferenceRecord,
  getPullRequestToInferenceRecord
} from '../clickhouseClient.js'
import { provideInferenceFeedback } from '../tensorZeroClient.js'

function parseAndValidateActionInputs(): CreatePrFeedbackActionInput {
  const inputs: CreatePrFeedbackActionInput = {
    tensorZeroBaseUrl: core.getInput('tensorzero-base-url')?.trim(),
    tensorZeroPrMergedMetricName: core
      .getInput('tensorzero-pr-merged-metric-name')
      ?.trim(),
    clickhouseUrl: core.getInput('clickhouse-url')?.trim(),
    clickhouseTable: core.getInput('clickhouse-table')?.trim()
  }
  if (!inputs.tensorZeroBaseUrl) {
    throw new Error(
      'TensorZero base url is required; provide one via the `tensorzero-base-url` input.'
    )
  }
  if (!inputs.tensorZeroPrMergedMetricName) {
    throw new Error(
      'TensorZero PR merged metric name is required; provide one via the `tensorzero-pr-merged-metric-name` input.'
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

export async function run(): Promise<void> {
  const inputs = parseAndValidateActionInputs()
  const { tensorZeroBaseUrl, tensorZeroPrMergedMetricName } = inputs

  const pullRequestId = github.context.payload.pull_request?.id
  if (!pullRequestId) {
    throw new Error('Did not receive a pull request ID from the context.')
  }
  core.info(
    `Handling Pull Request ID ${pullRequestId} (#${github.context.payload.pull_request?.number}).`
  )
  core.info(
    `Handling Pull Request Merged ${github.context.payload.pull_request?.merged}.`
  )

  const isPullRequestMerged =
    (github.context.payload.pull_request?.merged as boolean) ?? false

  const inferenceRecords = await getPullRequestToInferenceRecord(pullRequestId)
  if (!isPullRequestEligibleForFeedback(inferenceRecords)) {
    return
  }

  core.info(`Inference Records: ${JSON.stringify(inferenceRecords, null, 2)}`)

  // Provide feedback
  const feedbackReason: string = isPullRequestMerged
    ? 'Pull Request Merged'
    : 'Pull Request Rejected'
  await Promise.all(
    inferenceRecords.map(async (record) => {
      await provideInferenceFeedback(
        tensorZeroBaseUrl,
        tensorZeroPrMergedMetricName,
        record.inference_id,
        isPullRequestMerged,
        { reason: feedbackReason }
      )
      core.info(
        `Feedback (${isPullRequestMerged}) provided for inference ${record.inference_id}`
      )
    })
  )
}
