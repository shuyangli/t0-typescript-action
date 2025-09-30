import { jest } from '@jest/globals'

const mockInsert = jest.fn()
const mockQuery = jest.fn()
const mockClose = jest.fn()
const createClientMock = jest.fn(() => ({
  insert: mockInsert,
  query: mockQuery,
  close: mockClose
}))

await jest.unstable_mockModule('@clickhouse/client', () => ({
  __esModule: true,
  createClient: createClientMock
}))

const { createPullRequestToInferenceRecord, getPullRequestToInferenceRecords } =
  await import('./clickhouseClient.js')

const defaultConfig = {
  url: 'https://clickhouse.example.com',
  table: 'tensorzero.inference_records'
}

describe('clickhouseClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockInsert.mockResolvedValue(undefined)
    mockQuery.mockImplementation(async () => ({
      json: jest.fn().mockResolvedValue([])
    }))
    mockClose.mockResolvedValue(undefined)
  })

  it('writes inference records using structured inserts', async () => {
    await createPullRequestToInferenceRecord(
      {
        inferenceId: 'abc-123',
        pullRequestId: 42,
        originalPullRequestUrl: 'https://github.com/org/repo/pull/42'
      },
      defaultConfig
    )

    expect(createClientMock).toHaveBeenCalledWith({
      url: 'https://clickhouse.example.com',
      application: 'tensorzero-github-action'
    })
    expect(mockInsert).toHaveBeenCalledWith({
      table: 'tensorzero.inference_records',
      values: [
        {
          pull_request_id: 42,
          inference_id: 'abc-123',
          original_pull_request_url: 'https://github.com/org/repo/pull/42'
        }
      ],
      format: 'JSONEachRow'
    })
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('queries inference records with parameter binding', async () => {
    const expectedRecords = [
      {
        inference_id: 'xyz',
        pull_request_id: 77,
        created_at: '2024-01-01T00:00:00Z',
        original_pull_request_url: 'https://github.com/org/repo/pull/77'
      }
    ]
    const jsonMock = jest.fn().mockResolvedValue(expectedRecords)
    mockQuery.mockResolvedValueOnce({ json: jsonMock })

    const records = await getPullRequestToInferenceRecords(77, defaultConfig)

    expect(mockQuery).toHaveBeenCalledWith({
      query:
        'SELECT inference_id, pull_request_id, created_at, original_pull_request_url FROM tensorzero.inference_records WHERE pull_request_id = {pullRequestId:UInt64}',
      query_params: { pullRequestId: 77 },
      format: 'JSONEachRow'
    })
    expect(jsonMock).toHaveBeenCalledTimes(1)
    expect(records).toEqual(expectedRecords)
  })

  it('throws when the table name fails validation', async () => {
    await expect(
      createPullRequestToInferenceRecord(
        {
          inferenceId: 'abc',
          pullRequestId: 1,
          originalPullRequestUrl: 'https://example.com/pr/1'
        },
        { ...defaultConfig, table: 'invalid-table!' }
      )
    ).rejects.toThrow('ClickHouse table name must contain only')

    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('validates missing URL', async () => {
    await expect(
      createPullRequestToInferenceRecord(
        {
          inferenceId: 'abc',
          pullRequestId: 1,
          originalPullRequestUrl: 'https://example.com/pr/1'
        },
        { ...defaultConfig, url: ' ' }
      )
    ).rejects.toThrow('ClickHouse URL is required')
  })

  it('closes the client even if insert fails', async () => {
    mockInsert.mockRejectedValueOnce(new Error('insert failed'))

    await expect(
      createPullRequestToInferenceRecord(
        {
          inferenceId: 'abc',
          pullRequestId: 1,
          originalPullRequestUrl: 'https://example.com/pr/1'
        },
        defaultConfig
      )
    ).rejects.toThrow('insert failed')

    expect(mockClose).toHaveBeenCalledTimes(1)
  })
})
