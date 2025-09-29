import * as fs from 'fs'
import * as path from 'path'
import * as core from '@actions/core'

export async function readArtifactContentsRecursively(
  rootDir: string
): Promise<string[]> {
  const artifactContents: string[] = []

  try {
    // Check if we can access the directory
    await fs.promises.access(rootDir)
  } catch (error) {
    core.warning(`Directory does not exist: ${rootDir}`)
    return artifactContents
  }

  let filePaths: string[] = []
  try {
    filePaths = await fs.promises.readdir(rootDir, {
      recursive: true
    })
    core.info(
      `Found ${filePaths.length} fileNames/directories in directory: ${rootDir}`
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : `${error}`
    core.warning(`Failed to read directory ${rootDir}: ${errorMessage}`)
    return artifactContents
  }

  // Expand path and filter to only files
  const fileInfo = (
    await Promise.all(
      filePaths.map(async (relativePath) => {
        const absolutePath = path.join(rootDir, relativePath)
        try {
          const stat = await fs.promises.stat(absolutePath)
          return { relativePath, absolutePath, isFile: stat.isFile() }
        } catch (error) {
          core.warning(`Could not stat file ${absolutePath}: ${error}`)
          return { relativePath, absolutePath, isFile: false }
        }
      })
    )
  ).filter((item) => item.isFile)

  for (const { relativePath, absolutePath } of fileInfo) {
    try {
      const content = await fs.promises.readFile(absolutePath, 'utf-8')
      artifactContents.push(`## ${relativePath}\n\n${content}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `${error}`
      core.warning(`Failed to read file ${absolutePath}: ${errorMessage}`)
      // Continue with other files instead of failing completely
    }
  }

  return artifactContents
}
