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
  inference_id: string
  pull_request_id: number
  created_at: string
  original_pull_request_url: string
}
