import Handlebars from 'handlebars'

import { type PrPatchPromptContext } from './types.js'

const prPatchTemplateSource = `You are an expert software engineer helping to craft a follow-up pull request that fixes CI failures in the original PR.

Repository: {{repoFullName}}
Target Branch: {{#if branch}}{{branch}}{{else}}(unknown){{/if}}
Original PR: {{#if prNumber}}#{{prNumber}}{{else}}(unknown){{/if}}

{{#if failedJobs.length}}
## Failed Jobs
{{#each failedJobs}}
- {{name}} (conclusion: {{#if conclusion}}{{conclusion}}{{else}}unknown{{/if}}){{#if htmlUrl}} – {{htmlUrl}}{{/if}}
{{#if failedSteps.length}}
  Failed steps:
{{#each failedSteps}}
  * {{name}} (status: {{status}}{{#if conclusion}}, conclusion: {{conclusion}}{{/if}})
{{/each}}
{{/if}}
{{/each}}

{{else}}
## Failed Jobs
No failing jobs were detected in the most recent run.
{{/if}}

## Diff Summary
{{#if diffSummary}}{{diffSummary}}{{else}}Diff summary not supplied.{{/if}}

## Full Diff
{{#if fullDiff}}{{fullDiff}}{{else}}Full diff not supplied.{{/if}}

{{#if artifactContents.length}}
## Available Artifacts
{{#each artifactContents}}
{{this}}

{{/each}}
{{else}}
No artifact were available from the failing run.
{{/if}}

Your response should contain the following:

* a comment about the failure to be posted to the original PR as a comment. Include the comment in the comments block like this:

<comments>
Comments about the failure.
</comments>

* if the failure can be fixed by the user running a command, write a comment that includes the command and its expected output. Include the comment in the comments block.

* if the failure is due to an issue in the code, provide a unified diff patch that applies those fixes. Your diff will be generated as a new PR against the original PR branch.
The diff should be wrapped in a block like this:

<diff>
Verbatim diff that you generated that can be applied as a patch to the original PR branch.
</diff>

If there is nothing to fix, only write a comment about the failure.

IMPORTANT: You are not allowed to modify any GitHub actions. You can only modify the code in the repository.
`

const prPatchTemplate = Handlebars.compile<PrPatchPromptContext>(
  prPatchTemplateSource.trim()
)

export function renderPrPatchPrompt(context: PrPatchPromptContext): string {
  return prPatchTemplate(context).trim()
}

export function extractCommentsFromLlmResponse(response: string): string {
  const comments = response.match(/<comments>(.*?)<\/comments>/s)
  return comments ? comments[1] : ''
}

export function extractDiffFromLlmResponse(response: string): string {
  const diff = response.match(/<diff>(.*?)<\/diff>/s)
  return diff ? diff[1] : ''
}
