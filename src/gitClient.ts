import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fsPromises from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import * as core from '@actions/core'

const execFileAsync = promisify(execFile)

export type OctokitInstance = ReturnType<
  typeof import('@actions/github').getOctokit
>

export type PullRequestData = Awaited<
  ReturnType<OctokitInstance['rest']['pulls']['get']>
>['data']

export interface FollowupPrResult {
  number: number
  id: number
  htmlUrl: string
}

export interface CreateFollowupPrOptions {
  octokit: OctokitInstance
  token: string
  owner: string
  repo: string
  pullRequest: PullRequestData
  diff: string
}

function maskSecret(value: string, secret: string | undefined): string {
  if (!secret || !value) {
    return value
  }
  return value.split(secret).join('***')
}

async function execGit(
  args: string[],
  options: { cwd?: string; token?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
  const { cwd, token } = options
  const commandString = maskSecret(`git ${args.join(' ')}`, token)
  core.info(commandString)
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0'
      },
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8'
    })
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? ''
    }
  } catch (error) {
    const err = error as { message: string; stdout?: string; stderr?: string }
    const stderr = err.stderr || err.stdout || err.message
    throw new Error(`${commandString} failed: ${maskSecret(stderr, token)}`)
  }
}

export async function createFollowupPr(
  { octokit, token, owner, repo, pullRequest, diff }: CreateFollowupPrOptions,
  outputDir?: string
): Promise<FollowupPrResult | undefined> {
  const normalizedDiff = diff.trim()
  if (!normalizedDiff) {
    core.info(
      'Diff content empty after trimming; skipping follow-up PR creation.'
    )
    return undefined
  }

  if (
    !pullRequest.head.repo ||
    pullRequest.head.repo.full_name !== `${owner}/${repo}`
  ) {
    core.warning(
      'Original PR branch lives in a fork; skipping follow-up PR creation.'
    )
    return undefined
  }

  const tempBaseDir = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'tensorzero-pr-')
  )
  const repoDir = path.join(tempBaseDir, 'repo')
  const remoteUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
  const maskedRemoteUrl = maskSecret(remoteUrl, token)
  try {
    await execGit(
      [
        'clone',
        '--origin',
        'origin',
        '--branch',
        pullRequest.head.ref,
        remoteUrl,
        repoDir
      ],
      {
        token
      }
    )

    const fixBranchName = `tensorzero/pr-${pullRequest.number}-${Date.now()}`
    await execGit(['checkout', '-b', fixBranchName], { cwd: repoDir, token })

    const patchPath = path.join(repoDir, 'tensorzero.patch')
    await fsPromises.writeFile(
      patchPath,
      `${normalizedDiff}
`,
      { encoding: 'utf-8' }
    )
    try {
      await execGit(['apply', '--whitespace=nowarn', patchPath], {
        cwd: repoDir,
        token
      })
    } finally {
      await fsPromises.rm(patchPath, { force: true })
    }

    const status = await execGit(['status', '--porcelain'], {
      cwd: repoDir,
      token
    })
    if (!status.stdout.trim()) {
      core.warning(
        'Diff did not produce any changes; skipping follow-up PR creation.'
      )
      return undefined
    }

    await execGit(
      [
        'config',
        'user.email',
        '41898282+github-actions[bot]@users.noreply.github.com'
      ],
      {
        cwd: repoDir,
        token
      }
    )
    await execGit(['config', 'user.name', 'github-actions[bot]'], {
      cwd: repoDir,
      token
    })
    await execGit(['add', '--all'], { cwd: repoDir, token })
    await execGit(
      ['commit', '-m', `chore: automated fix for PR #${pullRequest.number}`],
      {
        cwd: repoDir,
        token
      }
    )
    await execGit(['push', '--set-upstream', 'origin', fixBranchName], {
      cwd: repoDir,
      token
    })

    const prTitle = `Automated follow-up for #${pullRequest.number}`
    const prBodyLines = [
      `This pull request was generated automatically in response to failing CI on #${pullRequest.number}.`,
      '',
      'The proposed changes were produced from an LLM-provided diff.'
    ]
    const prBody = prBodyLines.join('\n')

    const createdPr = await octokit.rest.pulls.create({
      owner,
      repo,
      base: pullRequest.head.ref,
      head: fixBranchName,
      title: prTitle,
      body: prBody
    })

    if (outputDir) {
      await fsPromises.writeFile(
        path.join(outputDir, 'followup-pr-payload.json'),
        JSON.stringify(createdPr, null, 2)
      )
    }

    return {
      number: createdPr.data.number,
      id: createdPr.data.id,
      htmlUrl: createdPr.data.html_url
    }
  } catch (error) {
    const maskedMessage = maskSecret((error as Error).message, token)
    core.error(
      `Failed to create follow-up PR using remote ${maskedRemoteUrl}: ${maskedMessage}`
    )
    return undefined
  } finally {
    await fsPromises.rm(tempBaseDir, { recursive: true, force: true })
  }
}
