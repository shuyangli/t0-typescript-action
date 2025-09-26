import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'

import {
  extractCommentsFromLlmResponse,
  extractDiffFromLlmResponse,
  renderPrPatchPrompt
} from './promptTemplate.js'
import {
  type WorkflowJobsResponse,
  type FollowupPrResult,
  type FailedJobSummary,
  type GeneratePrPatchActionInput
} from './types.js'
import {
  type CreatePullRequestToInferenceRequest,
  createPullRequestToInferenceRecord
} from '../clickhouseClient.js'
import { createFollowupPr } from '../gitClient.js'
import { callTensorZeroOpenAi } from '../tensorZeroClient.js'

async function getJobStatus(
  jobsUrl: string,
  token: string
): Promise<WorkflowJobsResponse> {
  // Fetch jobs from the workflow run
  const jobsResponse = await fetch(jobsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (jobsResponse.ok) {
    return (await jobsResponse.json()) as WorkflowJobsResponse
  }

  throw new Error('Failed to load jobs')
}

function getAllFailedJobs(
  workflowJobsStatus: WorkflowJobsResponse
): FailedJobSummary[] {
  return (workflowJobsStatus.jobs ?? [])
    .filter((job) => job.conclusion !== 'success')
    .map((job) => ({
      name: job.name,
      conclusion: job.conclusion,
      htmlUrl: job.html_url,
      failedSteps: (job.steps ?? [])
        .filter((step) => step.conclusion && step.conclusion !== 'success')
        .map((step) => ({
          name: step.name,
          status: step.status,
          conclusion: step.conclusion
        }))
    }))
}

function isPullRequestEligibleForFix(): boolean {
  // If the workflow run is not associated with a single pull request, we don't want to fix it.
  if (github.context.payload.workflow_run?.pull_requests?.length !== 1) {
    core.warning(
      `Workflow run is not associated with a single pull request; skipping action.`
    )
    return false
  }

  const pullRequest = github.context.payload.workflow_run.pull_requests[0]
  if (!pullRequest) {
    core.warning(
      `Workflow run is not associated with a pull request; skipping action.`
    )
    return false
  }

  // If the pull request originates from a fork, we don't want to fix it.
  if (pullRequest.head.repo?.id !== pullRequest.base.repo?.id) {
    core.warning(
      `PR originates from a fork: base repo is ${pullRequest.base.repo?.name}, but PR branch is from ${pullRequest.head.repo?.name}; skipping action.`
    )
    return false
  }

  // If the workflow run did not fail, we don't want to fix it.
  if (github.context.payload.workflow_run.conclusion !== 'failure') {
    core.warning(
      `Workflow run did not fail (conclusion ${github.context.payload.workflow_run.conclusion}); skipping action.`
    )
    return false
  }

  // If the pull request is not targeting the main branch, we don't want to fix it.
  if (
    pullRequest.base?.ref !== github.context.payload.repository?.default_branch
  ) {
    core.warning(
      `PR is not targeting the main branch: PR branch is ${pullRequest.base?.ref}, but main branch is ${github.context.payload.repository?.default_branch}; skipping action.`
    )
    return false
  }

  core.info(`PR is eligible for fix.`)
  return true
}

// Parse action inputs
function parseAndValidateActionInputs(): GeneratePrPatchActionInput {
  const token = core.getInput('token')?.trim() || process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error(
      'A GitHub token is required. Provide one via the `token` input or `GITHUB_TOKEN` env variable.'
    )
  }
  const tensorZeroBaseUrl = core.getInput('tensorzero-base-url')?.trim()
  if (!tensorZeroBaseUrl) {
    throw new Error(
      'TensorZero base url is required; provide one via the `tensorzero-base-url` input.'
    )
  }

  return {
    token,
    tensorZeroBaseUrl,
    diffSummaryPath: core.getInput('diff-summary-path')?.trim(),
    fullDiffPath: core.getInput('full-diff-path')?.trim(),
    inputLogsDir: core.getInput('input-logs-dir')?.trim(),
    outputArtifactsDir: core.getInput('output-artifacts-dir')?.trim()
  }
}

/**
 * Collects artifacts, builds a prompt to an LLM, then
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  const inputs = parseAndValidateActionInputs()
  const {
    token,
    tensorZeroBaseUrl,
    diffSummaryPath,
    fullDiffPath,
    inputLogsDir,
    outputArtifactsDir
  } = inputs
  // Prepare artifact directory
  core.info(`Action running in directory ${process.cwd()}`)
  const outputDir = outputArtifactsDir
    ? path.join(process.cwd(), outputArtifactsDir)
    : undefined
  if (outputDir) {
    core.info(`Output artifact directory: ${outputDir}`)
    fs.mkdirSync(outputDir, { recursive: true })
  } else {
    core.warning(`Not creating output artifacts.`)
  }

  // Write context for debugging
  if (outputDir) {
    fs.writeFileSync(
      path.join(outputDir, 'payload.json'),
      JSON.stringify(github.context.payload, null, 2)
    )
    core.info('Payload written to payload.json')
  }

  if (!isPullRequestEligibleForFix()) {
    core.warning(`Pull request is not eligible for fix. Skipping action.`)
    return
  }

  const workflow_run_payload = github.context.payload['workflow_run']
  const runId = workflow_run_payload.id
  if (!runId) {
    throw new Error('Unable to determine target workflow run.')
  }
  core.info(`Target workflow run ID: ${runId}`)

  if (workflow_run_payload.conclusion !== 'failure') {
    core.warning(`Workflow run did not fail. Skipping action.`)
    return
  }

  // Fetching jobs from the workflow run to get what steps failed
  const jobsUrl = workflow_run_payload.jobs_url
  if (!jobsUrl) {
    throw new Error('Missing jobs_url from workflow_run')
  }
  core.info(`Fetching jobs from: ${jobsUrl}`)
  const workflowJobsStatus = await getJobStatus(jobsUrl, token)

  if (outputDir) {
    fs.writeFileSync(
      path.join(outputDir, 'workflow-jobs.json'),
      JSON.stringify(workflowJobsStatus, null, 2)
    )
    core.info('Jobs data written to workflow-jobs.json')
  }

  // Load diff summary and full diff.
  // TODO: consider loading pull request diff here using github REST APIs.
  const diffSummary = fs.readFileSync(diffSummaryPath, { encoding: 'utf-8' })
  const fullDiff = fs.readFileSync(fullDiffPath, { encoding: 'utf-8' })
  const failedJobs: FailedJobSummary[] = getAllFailedJobs(workflowJobsStatus)

  // Collect artifacts from failed workflow run
  const { owner, repo } = github.context.repo
  const octokit = github.getOctokit(token)

  // Read failure logs from local filesystem
  // TODO: specify the API for passing files.
  const failureLogsDir = path.join(process.cwd(), inputLogsDir)

  // TODO: recursively traverse `failureLogsDir`, collect the contents of all files, and append them to `artifactContents`.
  let artifactContents: string[] = []
  try {
    if (fs.existsSync(failureLogsDir)) {
      const files = fs.readdirSync(failureLogsDir)
      core.info(
        `Found ${files.length} files in failure-logs directory: ${files.join(', ')}`
      )

      for (const file of files) {
        const filePath = path.join(failureLogsDir, file)
        const stat = fs.statSync(filePath)

        if (stat.isFile()) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            artifactContents.push(`## ${file}\n\n${content}`)
            core.info(
              `Read content from ${file} (${content.length} characters)`
            )
          } catch (error) {
            core.warning(`Failed to read ${file}: ${error}`)
          }
        }
      }
    } else {
      core.warning(`Failure logs directory not found: ${failureLogsDir}`)
    }
  } catch (error) {
    core.warning(
      `Error reading failure logs directory ${failureLogsDir}: ${error}`
    )
  }

  core.endGroup()

  // Construct a prompt to call an LLM.
  const prompt = renderPrPatchPrompt({
    repoFullName: `${owner}/${repo}`,
    branch: workflow_run_payload.head_branch,
    prNumber: workflow_run_payload.pull_requests?.[0]?.number,
    diffSummary,
    fullDiff,
    artifactContents,
    failedJobs
  })
  core.info(prompt)

  if (outputDir) {
    const llmPromptPath = path.join(outputDir, 'llm-prompt.txt')
    fs.writeFileSync(llmPromptPath, prompt)
    core.info(`Prompt written to ${llmPromptPath}`)
  }

  const systemPrompt =
    'You are a meticulous senior engineer who produces concise plans and clean patches to repair failing pull requests.'
  const response = await callTensorZeroOpenAi(
    tensorZeroBaseUrl,
    systemPrompt,
    prompt
  )

  if (outputDir) {
    fs.writeFileSync(
      path.join(outputDir, 'llm-response.json'),
      JSON.stringify(response, null, 2)
    )

    fs.writeFileSync(
      path.join(outputDir, 'artifact-contents.txt'),
      artifactContents.join('\n\n' + '='.repeat(80) + '\n\n')
    )
  }

  // Get the LLM response from `response`
  const llmResponse = response.choices[0].message.content
  if (!llmResponse) {
    throw new Error('No LLM response found, failing the action.')
  }

  const comments = extractCommentsFromLlmResponse(llmResponse)
  const diff = extractDiffFromLlmResponse(llmResponse)

  if (comments) {
    core.setOutput('comment', comments)
  } else {
    core.setOutput('comment', '')
  }

  if (!comments && !diff) {
    core.info(
      'LLM response contained neither comments nor diff; finishing without changes.'
    )
    return
  }

  const prNumber = workflow_run_payload.pull_requests?.[0]?.number
  if (!prNumber) {
    core.warning(
      'Unable to identify the original pull request; skipping comment and follow-up PR creation.'
    )
    return
  }

  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber
  })

  const trimmedDiff = diff.trim()
  let followupPr: FollowupPrResult | undefined
  if (trimmedDiff) {
    followupPr = await createFollowupPr(
      {
        octokit,
        token,
        owner,
        repo,
        pullRequest,
        diff: trimmedDiff
      },
      outputDir
    )
  }

  // TODO: consider using episode_id instead of inference ID.
  const inferenceId = response.id

  if (followupPr) {
    const request: CreatePullRequestToInferenceRequest = {
      inferenceId,
      pullRequestId: followupPr.id,
      originalPullRequestUrl: pullRequest.html_url
    }
    core.info(`Outgoing request: ${JSON.stringify(request, null, 2)}`)
    try {
      await createPullRequestToInferenceRecord(request)
      core.info(
        `Recorded inference ${inferenceId} for follow-up PR #${followupPr.number} (id ${followupPr.id}) in ClickHouse.`
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `${error}`
      core.warning(
        `Failed to record inference ${inferenceId} for follow-up PR #${followupPr.number} (id ${followupPr.id}) in ClickHouse: ${errorMessage}`
      )
    }
  }

  let commentBody = comments.trim()
  if (followupPr) {
    const prLink = `[#${followupPr.number}](${followupPr.htmlUrl})`
    if (commentBody) {
      commentBody += `\n\nI've also opened an automated follow-up PR ${prLink} with proposed fixes.`
    } else {
      commentBody = `I've opened an automated follow-up PR ${prLink} with proposed fixes.`
    }
  }

  if (commentBody) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody
    })
  }
}
