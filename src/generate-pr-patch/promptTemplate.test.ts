import {
  renderPrPatchPrompt,
  extractCommentsFromLlmResponse,
  extractDiffFromLlmResponse
} from './promptTemplate.js'

describe('renderPrPatchPrompt', () => {
  it('fills in sensible defaults when optional data is missing', () => {
    const prompt = renderPrPatchPrompt({
      repoFullName: 'tensorzero/example-repo',
      artifactContents: [],
      failedJobs: []
    })

    expect(prompt).toContain('Repository: tensorzero/example-repo')
    expect(prompt).toContain('Target Branch: (unknown)')
    expect(prompt).toContain('Original PR: (unknown)')
    expect(prompt).toContain('Diff summary not supplied.')
    expect(prompt).toContain('Full diff not supplied.')
    expect(prompt).toContain('No artifact were available from the failing run.')
  })

  it('includes failed jobs, steps, and artifact contents when provided', () => {
    const prompt = renderPrPatchPrompt({
      repoFullName: 'tensorzero/example-repo',
      branch: 'main',
      prNumber: 42,
      diffSummary: '1 file changed, 2 insertions(+)',
      fullDiff: 'diff --git a/file.ts b/file.ts',
      artifactContents: ['## log.txt\nFailure stack trace'],
      failedJobs: [
        {
          name: 'lint',
          conclusion: 'failure',
          htmlUrl: 'https://example.com/job',
          failedSteps: [
            {
              name: 'Run lint',
              status: 'completed',
              conclusion: 'failure'
            }
          ]
        }
      ]
    })

    expect(prompt).toContain('Target Branch: main')
    expect(prompt).toContain('Original PR: #42')
    expect(prompt).toMatch(
      /- lint \(conclusion: failure\).+https:\/\/example.com\/job/
    )
    expect(prompt).toContain(
      '* Run lint (status: completed, conclusion: failure)'
    )
    expect(prompt).toContain('## log.txt')
    expect(prompt).toContain('Failure stack trace')
  })
})

describe('LLM response helpers', () => {
  it('extracts comments and diffs between markers', () => {
    const response = `prefix
<comments>A detailed summary</comments>
<diff>diff --git</diff>
suffix`

    expect(extractCommentsFromLlmResponse(response)).toBe('A detailed summary')
    expect(extractDiffFromLlmResponse(response)).toBe('diff --git')
  })

  it('returns empty strings when markers are missing', () => {
    const response = 'no structured response here'

    expect(extractCommentsFromLlmResponse(response)).toBe('')
    expect(extractDiffFromLlmResponse(response)).toBe('')
  })
})
