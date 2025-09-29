import {
  extractCommandFromLlmResponse,
  extractCommentsFromLlmResponse,
  extractDiffFromLlmResponse
} from './llmResponse.js'

describe('LLM response helpers', () => {
  it('extracts comments and diffs between markers', () => {
    const response = `prefix
<comments>A detailed summary</comments>
<command>A command line command</command>
<diff>diff --git</diff>
suffix`

    expect(extractCommentsFromLlmResponse(response)).toBe('A detailed summary')
    expect(extractCommandFromLlmResponse(response)).toBe('A command line command')
    expect(extractDiffFromLlmResponse(response)).toBe('diff --git')
  })

  it('returns empty strings when markers are missing', () => {
    const response = 'no structured response here'

    expect(extractCommentsFromLlmResponse(response)).toBe('')
    expect(extractDiffFromLlmResponse(response)).toBe('')
  })
})
