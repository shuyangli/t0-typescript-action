import { createClient } from '@clickhouse/client'
import * as core from '@actions/core'
import {
  ClickHouseConfig,
  CreatePullRequestToInferenceRequest
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
