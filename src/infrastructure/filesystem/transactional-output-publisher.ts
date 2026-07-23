import { randomUUID } from "node:crypto"
import { access, mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import path from "node:path"
import type { OutputBuilder, OutputPublisher } from "../../application/ports/output-publisher.ts"

export class TransactionalOutputPublisher implements OutputPublisher {
  async publish(targetDirectory: string, build: OutputBuilder): Promise<void> {
    const target = validateTarget(targetDirectory)
    const parent = path.dirname(target)
    const name = path.basename(target)
    await mkdir(parent, { recursive: true })

    const staging = await mkdtemp(path.join(parent, `.${name}.staging-`))
    const backup = path.join(parent, `.${name}.backup-${randomUUID()}`)
    let hasBackup = false

    try {
      await build(staging)

      if (await pathExists(target)) {
        await rename(target, backup)
        hasBackup = true
      }

      try {
        await rename(staging, target)
      } catch (error) {
        if (hasBackup) {
          await rename(backup, target)
          hasBackup = false
        }
        throw error
      }

      if (hasBackup) {
        await rm(backup, { recursive: true })
        hasBackup = false
      }
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      if (hasBackup && !(await pathExists(target))) {
        await rename(backup, target)
      }
      throw error
    }
  }
}

function validateTarget(targetDirectory: string): string {
  const target = path.resolve(targetDirectory)
  if (target === path.parse(target).root) {
    throw new Error(`Unsafe output target: ${target}`)
  }
  return target
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}
