import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'
import { OpenAI } from 'openai'

function getFileContentFromInput(inputName: string): string {
  const filepath = core.getInput(inputName)?.trim()
  if (!filepath) {
    throw new Error(
      `Input ${inputName} does not exist; check the GitHub Workflow definition`
    )
  }

  return fs.readFileSync(filepath, {
    encoding: 'utf-8'
  })
}

async function getJobStatus(jobsUrl: string, token: string): Promise<string> {
  // Fetch jobs from the workflow run
  const jobsResponse = await fetch(jobsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (jobsResponse.ok) {
    return (await jobsResponse.json()) as string
  }

  throw new Error('Failed to load jobs')
}

/**
 * The main function for the action.
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
  const artifactDir = path.join(process.cwd(), 'custom-action-artifacts')
  core.info(`Output artifact directory: ${artifactDir}`)
  fs.mkdirSync(artifactDir, { recursive: true })

  const tensorZeroBaseUrl = core.getInput('tensorzero-base-url')?.trim()
  if (!tensorZeroBaseUrl) {
    throw new Error(
      'TensorZero base url is required; provide one via the `tensorzero-base-url` input.'
    )
  }

  // const apiKey = core.getInput('openai-api-key')?.trim()

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
    path.join(artifactDir, 'workflow-jobs.json'),
    JSON.stringify(workflowJobsStatus, null, 2)
  )
  core.info('Jobs data written to workflow-jobs.json')

  // Load diff summary and full diff.
  // TODO: consider loading pull request diff here using github REST APIs.
  const diffSummary = getFileContentFromInput('diff-summary-path')
  const fullDiff = getFileContentFromInput('full-diff-path')

  core.info(diffSummary)

  core.info(fullDiff)

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
  if (!artifacts.length) {
    core.warning('No artifacts found for the failing workflow run.')
  } else {
    for (const artifact of artifacts) {
      core.info(`• ${artifact.name} (${artifact.size_in_bytes} bytes)`)
    }
  }
  core.endGroup()

  // Construct a prompt to call an LLM.
  const client = new OpenAI({
    baseURL: tensorZeroBaseUrl
  })
  const response = await client.chat.completions.create({
    model: 'gpt-5',
    messages: [
      {
        content: 'Who are you?',
        role: 'user'
      }
    ]
  })

  fs.writeFileSync(
    path.join(artifactDir, 'llm-response.json'),
    JSON.stringify(response, null, 2)
  )

  fs.writeFileSync(
    path.join(artifactDir, 'artifacts.json'),
    JSON.stringify(artifacts, null, 2)
  )

  fs.writeFileSync(
    path.join(artifactDir, 'artifact-names.txt'),
    artifacts.map((artifact) => artifact.name).join('\n')
  )

  core.setOutput(
    'artifact-names',
    artifacts.map((artifact) => artifact.name).join('\n')
  )
  core.setOutput('artifact-count', artifacts.length.toString())
}
