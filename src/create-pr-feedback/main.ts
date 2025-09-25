import * as core from '@actions/core'
import { context } from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'

type PullRequestPayload = {
  id?: number
  merged?: boolean
  number?: number
}

const supportedEvents = new Set(['pull_request', 'pull_request_target'])

function resolveClosedOrMergedPullRequest(): PullRequestPayload | null {
  if (!supportedEvents.has(context.eventName)) {
    core.info(
      `Event '${context.eventName}' is not supported. This action only runs when pull requests are closed or merged. Skipping.`
    )
    return null
  }

  const pullRequest = context.payload.pull_request as
    | PullRequestPayload
    | undefined
  if (!pullRequest) {
    core.info(
      'Pull request payload missing from event. Skipping action execution.'
    )
    return null
  }

  const action = context.payload.action
  if (action !== 'closed') {
    core.info(
      `Pull request action '${action ?? 'unknown'}' does not indicate a merge or close. Skipping action execution.`
    )
    return null
  }

  return pullRequest
}

export async function run(): Promise<void> {
  try {
    const pullRequest = resolveClosedOrMergedPullRequest()
    if (!pullRequest) {
      return
    }

    core.info(JSON.stringify(pullRequest, null, 2))
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed('Unknown error occurred while creating PR feedback.')
    }
  }
}
