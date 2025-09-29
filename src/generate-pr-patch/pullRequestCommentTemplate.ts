import Handlebars from 'handlebars'

const commentTemplateString = `
### TensorZero CI Bot Automated Comment


{{#if followupPrNumber}}
I've also opened an automated follow-up PR #{{followupPrNumber}} with proposed fixes.
{{/if}}
`

export interface CommentTemplateContext {
  generatedCommentBody?: string
  followupPrNumber?: number
}

const commentTemplate = Handlebars.compile<CommentTemplateContext>(
  commentTemplateString.trim()
)

export function renderComment(
  commentContext: CommentTemplateContext
): string | undefined {
  if (!commentContext.generatedCommentBody) {
    return undefined
  }
  return commentTemplate(commentContext).trim()
}
