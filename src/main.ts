import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'

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

  core.info(`Action running in directory ${process.cwd()}`)

  const octokit = github.getOctokit(token)
  const workflow_run_payload = github.context.payload['workflow_run']
  const runId = workflow_run_payload.id
  if (!runId) {
    throw new Error('Unable to determine target workflow run.')
  }

  core.info(`Target workflow run ID: ${runId}`)

  // Prepare artifact directory
  // const diagnosticsDir = core.getInput('artifacts-dir')
  const artifactDir = path.join(process.cwd(), 'custom-action-artifacts')
  core.warning(`Artifact directory: ${artifactDir}`)
  fs.mkdirSync(artifactDir, { recursive: true })

  // Debug only
  core.startGroup(`Logging input`)
  fs.writeFileSync(
    path.join(process.cwd(), 'workflow_run_payload.json'),
    JSON.stringify(workflow_run_payload, null, 2)
  )

  fs.writeFileSync(
    path.join(process.cwd(), 'github_context.json'),
    JSON.stringify(github.context, null, 2)
  )
  core.endGroup()

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
