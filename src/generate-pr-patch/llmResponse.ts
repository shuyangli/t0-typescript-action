export function extractCommentsFromLlmResponse(response: string): string {
  const comments = response.match(/<comment>(.*?)<\/comment>/s)
  return comments ? comments[1] : ''
}

export function extractCommandFromLlmResponse(response: string): string {
  const diff = response.match(/<command>(.*?)<\/command>/s)
  return diff ? diff[1] : ''
}

export function extractDiffFromLlmResponse(response: string): string {
  const diff = response.match(/<diff>(.*?)<\/diff>/s)
  return diff ? diff[1] : ''
}
