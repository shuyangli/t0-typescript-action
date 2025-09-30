import { createClient } from '@clickhouse/client'
import * as core from '@actions/core'

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

const CLICKHOUSE_TABLE_NAME_REGEX = /^[a-zA-Z0-9_.]+$/

function assertValidTableName(table: string): void {
  if (!CLICKHOUSE_TABLE_NAME_REGEX.test(table)) {
    throw new Error(
      'ClickHouse table name must contain only alphanumeric characters, underscores, or dots.'
    )
  }
}

function getClickhouseClientConfig(): ClickHouseConfig {
  // http[s]://[username:password@]hostname:port[/database]
  const clickHouseUrl = core.getInput('clickhouse-url')?.trim()
  const clickHouseTable = core.getInput('clickhouse-table')?.trim()

  if (!clickHouseUrl) {
    throw new Error(
      'ClickHouse URL is required when configuring ClickHouse logging; provide one via the `clickhouse-url` input.'
    )
  }

  if (!clickHouseTable) {
    throw new Error(
      'ClickHouse table name is required when configuring ClickHouse logging; provide one via the `clickhouse-table` input.'
    )
  }

  assertValidTableName(clickHouseTable)

  return {
    url: clickHouseUrl,
    table: clickHouseTable
  }
}

export async function createPullRequestToInferenceRecord(
  request: CreatePullRequestToInferenceRequest
): Promise<void> {
  const { url, table } = getClickhouseClientConfig()
  const client = createClient({
    url,
    application: 'tensorzero-github-action'
  })
  try {
    await client.insert({
      table,
      values: [
        {
          pull_request_id: request.pullRequestId,
          inference_id: request.inferenceId,
          original_pull_request_url: request.originalPullRequestUrl
        }
      ],
      format: 'JSONEachRow'
    })
  } finally {
    await client.close()
  }
}

// Returns all inference records for a given pull request. There should only be one since so far for simplicity, the table should be created with a ReplacingMergeTree, but we may want to support multiple inferences for interactive PR updates.
export async function getPullRequestToInferenceRecords(
  pullRequestId: number
): Promise<PullRequestToInferenceRecord[]> {
  const { url, table } = getClickhouseClientConfig()
  const client = createClient({
    url,
    application: 'tensorzero-github-action'
  })
  let records: PullRequestToInferenceRecord[] = []
  try {
    const response = await client.query({
      query: `SELECT inference_id, pull_request_id, created_at, original_pull_request_url FROM ${table} WHERE pull_request_id = {pullRequestId:UInt64}`,
      query_params: { pullRequestId },
      format: 'JSONEachRow'
    })
    records = await response.json()
  } finally {
    await client.close()
  }
  return records
}
