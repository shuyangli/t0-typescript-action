import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'
import { OpenAI } from 'openai'

import { renderPrPatchPrompt, type FailedJobSummary } from './promptTemplate.js'

interface WorkflowJobStep {
  name: string
  status: string
  conclusion: string | null
}

interface WorkflowJob {
  id: number
  name: string
  conclusion: string | null
  status: string
  html_url?: string
  steps?: WorkflowJobStep[]
}

interface WorkflowJobsResponse {
  total_count: number
  jobs: WorkflowJob[]
}

function getFileContentFromInput(inputName: string): string | undefined {
  const filepath = core.getInput(inputName)?.trim()
  if (!filepath) {
    return undefined
  }

  return fs.readFileSync(filepath, {
    encoding: 'utf-8'
  })
}

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

function getOpenAiCompatibleUrl(): string {
  let tensorZeroBaseUrl = core.getInput('tensorzero-base-url')?.trim()
  if (!tensorZeroBaseUrl) {
    throw new Error(
      'TensorZero base url is required; provide one via the `tensorzero-base-url` input.'
    )
  }
  if (tensorZeroBaseUrl[tensorZeroBaseUrl.length - 1] === '/') {
    tensorZeroBaseUrl = tensorZeroBaseUrl.slice(0, -1)
  }
  return `${tensorZeroBaseUrl}/openai/v1`
}

/**
 * Collects artifacts, builds a prompt to an LLM, then
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  const token = core.getInput('token')?.trim() || process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error(
      'A GitHub token is required. Provide one via the `token` input or `GITHUB_TOKEN` env variable.'
    )
  }

  // Prepare artifact directory
  core.info(`Action running in directory ${process.cwd()}`)
  const artifactsDirInput =
    core.getInput('artifacts-dir')?.trim() || 'artifacts'
  const outputArtifactDir = path.join(process.cwd(), artifactsDirInput)
  core.info(`Output artifact directory: ${outputArtifactDir}`)
  fs.mkdirSync(outputArtifactDir, { recursive: true })

  const octokit = github.getOctokit(token)
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
  fs.writeFileSync(
    path.join(outputArtifactDir, 'workflow-jobs.json'),
    JSON.stringify(workflowJobsStatus, null, 2)
  )
  core.info('Jobs data written to workflow-jobs.json')

  // Load diff summary and full diff.
  // TODO: consider loading pull request diff here using github REST APIs.
  const diffSummary = getFileContentFromInput('diff-summary-path')
  const fullDiff = getFileContentFromInput('full-diff-path')
  const failedJobs: FailedJobSummary[] = getAllFailedJobs(workflowJobsStatus)

  // Collect artifacts from failed workflow run
  const { owner, repo } = github.context.repo
  const artifacts = await octokit.paginate(
    octokit.rest.actions.listWorkflowRunArtifacts,
    {
      owner,
      repo,
      run_id: Number(runId),
      per_page: 100
    }
  )

  core.startGroup(`Artifacts for workflow run ${runId}`)
  // TODO: read from local filesystem instead of fetching from GitHub.
  // let allArtifactContents: string[] = []
  if (!artifacts.length) {
    core.warning('No artifacts found for the failing workflow run.')
  }
  // else {
  //   for (const artifact of artifacts) {
  //   }
  // }
  core.endGroup()

  const prompt = renderPrPatchPrompt({
    repoFullName: `${owner}/${repo}`,
    branch: workflow_run_payload.head_branch,
    prNumber: workflow_run_payload.pull_requests?.[0]?.number,
    diffSummary,
    fullDiff,
    artifactNames: artifacts.map((artifact) => artifact.name),
    failedJobs
  })
  core.info(prompt)

  const llmPromptPath = path.join(outputArtifactDir, 'llm-prompt.txt')
  fs.writeFileSync(llmPromptPath, prompt)
  core.info(`Prompt written to ${llmPromptPath}`)

  // Construct a prompt to call an LLM.
  const tensorZeroOpenAiEndpointUrl = getOpenAiCompatibleUrl()
  const client = new OpenAI({
    baseURL: tensorZeroOpenAiEndpointUrl,
    apiKey: 'dummy'
  })
  const response = await client.chat.completions.create({
    model: 'tensorzero::model_name::openai::gpt-5',
    messages: [
      {
        content:
          'You are a meticulous senior engineer who produces concise plans and clean patches to repair failing pull requests.',
        role: 'system'
      },
      {
        content: prompt,
        role: 'user'
      }
    ]
  })

  fs.writeFileSync(
    path.join(outputArtifactDir, 'llm-response.json'),
    JSON.stringify(response, null, 2)
  )

  fs.writeFileSync(
    path.join(outputArtifactDir, 'artifacts.json'),
    JSON.stringify(artifacts, null, 2)
  )

  fs.writeFileSync(
    path.join(outputArtifactDir, 'artifact-names.txt'),
    artifacts.map((artifact) => artifact.name).join('\n')
  )
}
