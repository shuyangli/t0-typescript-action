import { createClient } from '@clickhouse/client'
import * as core from '@actions/core'
import {
  ClickHouseConfig,
  CreatePullRequestToInferenceRequest,
  PullRequestToInferenceRecord
} from './clickhouseTypes.js'

function getClickhouseClientConfig(): ClickHouseConfig {
  // http[s]://[username:password@]hostname:port[/database]
  const clickHouseUrl = core.getInput('clickhouse-url')?.trim()
  const clickHouseTable = core.getInput('clickhouse-table')?.trim()

  if (!clickHouseUrl) {
    throw new Error(
      'ClickHouse URL is required when configuring ClickHouse logging; provide one via the `clickhouse-host` input.'
    )
  }

  if (!clickHouseTable) {
    throw new Error(
      'ClickHouse table name is required when configuring ClickHouse logging; provide one via the `clickhouse-table` input.'
    )
  }

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
    await client.command({
      query: `INSERT INTO ${table} (pull_request_id, inference_id, original_pull_request_url) VALUES (${request.pullRequestId}, '${request.inferenceId}', '${request.originalPullRequestUrl}')`
    })
  } finally {
    await client.close()
  }
}

export async function getPullRequestToInferenceRecord(
  pullRequestId: number
): Promise<PullRequestToInferenceRecord | undefined> {
  const { url, table } = getClickhouseClientConfig()
  const client = createClient({
    url,
    application: 'tensorzero-github-action'
  })
  let records: PullRequestToInferenceRecord[] = []
  try {
    const response = await client.query({
      query: `SELECT * FROM ${table} WHERE pullRequestId = ${pullRequestId}`,
      format: 'JSONEachRow'
    })
    records = await response.json()
  } finally {
    await client.close()
  }
  return records[0] ?? undefined
}
