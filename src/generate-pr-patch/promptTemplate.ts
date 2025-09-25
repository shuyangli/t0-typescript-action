import Handlebars from 'handlebars'

export interface FailedStepSummary {
  name: string
  status: string
  conclusion: string | null
}

export interface FailedJobSummary {
  name: string
  conclusion: string | null
  failedSteps: FailedStepSummary[]
}

export interface PrPatchPromptContext {
  repoFullName: string
  branch?: string
  prNumber?: number
  diffSummary?: string
  fullDiff?: string
  artifactNames: string[]
  failedJobs: FailedJobSummary[]
}

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

{{#if artifactNames.length}}
## Available Artifacts
{{#each artifactNames}}
- {{this}}
{{/each}}
{{else}}
## Available Artifacts
No artifacts were collected from the failing run.
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
`

const prPatchTemplate = Handlebars.compile<PrPatchPromptContext>(
  prPatchTemplateSource.trim()
)

export function renderPrPatchPrompt(context: PrPatchPromptContext): string {
  return prPatchTemplate(context).trim()
}
