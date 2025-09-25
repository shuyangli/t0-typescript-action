export interface GeneratePrPatchActionInput {
  token: string
  tensorZeroBaseUrl: string
  diffSummaryPath: string
  fullDiffPath: string
  inputLogsDir: string
  outputArtifactsDir: string | undefined
}

export interface WorkflowJobStep {
  name: string
  status: string
  conclusion: string | undefined
}

export interface WorkflowJob {
  id: number
  name: string
  conclusion: string | undefined
  status: string
  html_url?: string
  steps?: WorkflowJobStep[]
}

export interface WorkflowJobsResponse {
  total_count: number
  jobs: WorkflowJob[]
}

export interface FailedStepSummary {
  name: string
  status: string
  conclusion: string | undefined
}

export interface FailedJobSummary {
  name: string
  conclusion: string | undefined
  failedSteps: FailedStepSummary[]
  htmlUrl?: string
}

export interface PrPatchPromptContext {
  repoFullName: string
  branch?: string
  prNumber?: number
  diffSummary?: string
  fullDiff?: string
  artifactContents: string[]
  failedJobs: FailedJobSummary[]
}

export type OctokitInstance = ReturnType<
  typeof import('@actions/github').getOctokit
>

export type PullRequestData = Awaited<
  ReturnType<OctokitInstance['rest']['pulls']['get']>
>['data']

export interface FollowupPrResult {
  number: number
  htmlUrl: string
}

export interface CreateFollowupPrOptions {
  octokit: OctokitInstance
  token: string
  owner: string
  repo: string
  pullRequest: PullRequestData
  diff: string
}
