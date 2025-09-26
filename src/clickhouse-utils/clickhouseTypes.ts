export interface ClickHouseConfig {
  url: string
  table: string
}

export interface CreatePullRequestToInferenceRequest {
  inferenceId: string
  pullRequestId: number
  originalPullRequestUrl: string
}

export interface PullRequestToInferenceRecord {
  inferenceId: string
  pullRequestId: number
  createdAt: string
  originalPullRequestUrl: string
}
