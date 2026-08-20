import { createHash, randomUUID } from "node:crypto"
import type { Stats } from "node:fs"
import {
  access,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
} from "node:fs/promises"
import path from "node:path"
import {
  type OutputSetPublisher,
  type OutputSetTarget,
  type OutputTargetPolicy,
  outputTargetPolicies,
} from "../../application/ports/output-set-publisher.ts"
import { invokeAsPromise } from "../async/settle-all.ts"

interface MakeDirectoryOptions {
  readonly recursive?: boolean
  readonly mode?: number | string
}

interface RemoveOptions {
  readonly recursive?: boolean
  readonly force?: boolean
  readonly maxRetries?: number
  readonly retryDelay?: number
}

export interface TransactionalOutputSetFileSystem {
  access(candidate: string): Promise<void>
  link(existingPath: string, newPath: string): Promise<void>
  lstat(candidate: string): Promise<Stats>
  mkdir(candidate: string, options?: MakeDirectoryOptions): Promise<string | undefined>
  mkdtemp(prefix: string): Promise<string>
  readdir(directory: string): Promise<string[]>
  realpath(candidate: string): Promise<string>
  readFile(candidate: string): Promise<Buffer>
  rename(source: string, destination: string): Promise<void>
  rm(candidate: string, options?: RemoveOptions): Promise<void>
  rmdir(candidate: string): Promise<void>
}

interface PublicationTarget {
  readonly definition: OutputSetTarget
  readonly targetPath: string
  readonly allowedRoot: string
  readonly stagingContainer: string
  readonly stagingPayload: string
  readonly backupPath: string
  backupCreated: boolean
  publicationCommitted: boolean
  targetOwned: boolean
}

const defaultFileSystem: TransactionalOutputSetFileSystem = {
  access,
  link,
  lstat,
  mkdir: (candidate, options) => mkdir(candidate, options),
  mkdtemp,
  readdir,
  realpath,
  readFile,
  rename,
  rm,
  rmdir,
}

export class TransactionalOutputSetPublisher implements OutputSetPublisher {
  readonly #fileSystem: TransactionalOutputSetFileSystem

  constructor(fileSystem: Partial<TransactionalOutputSetFileSystem> = {}) {
    this.#fileSystem = { ...defaultFileSystem, ...fileSystem }
  }

  async publish(targets: readonly OutputSetTarget[]): Promise<void> {
    const validatedTargets = validateTargets(targets)
    await this.#validatePhysicalTargets(validatedTargets)
    await this.#assertMustNotExistTargetsAreAbsent(validatedTargets, "validate")

    const publicationTargets: PublicationTarget[] = []
    const createdParentDirectories = new Set<string>()
    let primaryFailure: unknown
    let publicationFailed = false

    try {
      await this.#createStagingDirectories(
        validatedTargets,
        publicationTargets,
        createdParentDirectories,
      )
      await this.#buildAll(publicationTargets)
      await this.#validateStagedPayloads(publicationTargets)
      await this.#validatePhysicalTargets(publicationTargets.map((target) => target.definition))
      await this.#assertMustNotExistTargetsAreAbsent(
        publicationTargets.map((target) => target.definition),
        "recheck",
      )
      await this.#validateExpectedContents(publicationTargets)
      await this.#publishAll(publicationTargets)
    } catch (error) {
      publicationFailed = true
      primaryFailure = error
    }

    const cleanupFailures = await this.#cleanup(
      publicationTargets,
      createdParentDirectories,
      !publicationTargets.some((target) => target.publicationCommitted),
    )

    if (publicationFailed) {
      if (cleanupFailures.length > 0) {
        throw aggregateFailure(
          primaryFailure,
          cleanupFailures,
          "Output set publication failed and cleanup was incomplete",
        )
      }
      throw primaryFailure
    }

    if (cleanupFailures.length > 0) {
      throw cleanupFailure(cleanupFailures, "Output set publication cleanup failed")
    }
  }

  async #createStagingDirectories(
    targets: readonly OutputSetTarget[],
    publicationTargets: PublicationTarget[],
    createdParentDirectories: Set<string>,
  ): Promise<void> {
    for (const target of targets) {
      const parentDirectory = path.dirname(target.targetPath)
      await this.#ensureParentDirectory(parentDirectory, target, createdParentDirectories)
      await this.#validatePhysicalTargets([target])

      const name = path.basename(target.targetPath)
      const stagingContainer = await this.#withContext(
        "create a staging directory for",
        target.targetPath,
        () => this.#fileSystem.mkdtemp(path.join(parentDirectory, `.${name}.staging-`)),
      )

      publicationTargets.push({
        definition: target,
        targetPath: target.targetPath,
        allowedRoot: target.allowedRoot,
        stagingContainer,
        stagingPayload:
          target.kind === "directory" ? stagingContainer : path.join(stagingContainer, "payload"),
        backupPath: path.join(parentDirectory, `.${name}.backup-${randomUUID()}`),
        backupCreated: false,
        publicationCommitted: false,
        targetOwned: false,
      })
    }
  }

  async #ensureParentDirectory(
    parentDirectory: string,
    target: OutputSetTarget,
    createdParentDirectories: Set<string>,
  ): Promise<void> {
    const root = path.parse(parentDirectory).root
    const segments = path.relative(root, parentDirectory).split(path.sep).filter(Boolean)
    let candidate = root

    for (const segment of segments) {
      candidate = path.join(candidate, segment)
      try {
        await this.#fileSystem.lstat(candidate)
        if (
          samePath(candidate, target.allowedRoot) ||
          isStrictDescendant(candidate, target.allowedRoot)
        ) {
          await this.#validatePhysicalTargets([target])
        }
        continue
      } catch (cause) {
        if (!isMissingPathError(cause)) {
          throw contextualError("inspect the parent path for", target.targetPath, cause)
        }
      }

      try {
        await this.#fileSystem.mkdir(candidate)
        createdParentDirectories.add(candidate)
      } catch (cause) {
        if (!hasErrorCode(cause, "EEXIST")) {
          throw contextualError("prepare the parent directory for", target.targetPath, cause)
        }
      }
      if (
        samePath(candidate, target.allowedRoot) ||
        isStrictDescendant(candidate, target.allowedRoot)
      ) {
        await this.#validatePhysicalTargets([target])
      }
    }
  }

  async #buildAll(targets: readonly PublicationTarget[]): Promise<void> {
    const results = await Promise.allSettled(
      targets.map((target) =>
        invokeAsPromise(() => target.definition.build(target.stagingPayload)),
      ),
    )
    const firstFailureIndex = results.findIndex((result) => result.status === "rejected")

    if (firstFailureIndex !== -1) {
      const result = results[firstFailureIndex]
      const target = targets[firstFailureIndex]
      if (result?.status === "rejected" && target !== undefined) {
        throw contextualError("build", target.targetPath, result.reason)
      }
    }
  }

  async #validateStagedPayloads(targets: readonly PublicationTarget[]): Promise<void> {
    for (const target of targets) {
      if (target.definition.kind === "directory") {
        continue
      }
      let metadata: Stats
      try {
        metadata = await this.#fileSystem.lstat(target.stagingPayload)
      } catch (cause) {
        throw contextualError("inspect the staged file for", target.targetPath, cause)
      }
      if (!metadata.isFile()) {
        throw new Error(
          `Staged output for file target "${target.targetPath}" is not a regular file`,
        )
      }
    }
  }

  async #validateExpectedContents(targets: readonly PublicationTarget[]): Promise<void> {
    for (const target of targets) {
      if (target.definition.kind !== "file" || !target.definition.expectedContent) {
        continue
      }
      const expectation = target.definition.expectedContent
      if (expectation.state === "missing") {
        if (await this.#pathExists(target.targetPath)) {
          throw new Error(
            `Output target "${target.targetPath}" violated its content expectation: expected it to be missing`,
          )
        }
        continue
      }

      let content: Buffer
      try {
        content = await this.#fileSystem.readFile(target.targetPath)
      } catch (cause) {
        throw new Error(
          `Output target "${target.targetPath}" changed after preparation: could not verify its SHA-256 content expectation`,
          { cause },
        )
      }
      const actualHash = createHash("sha256").update(content).digest("hex")
      if (actualHash !== expectation.sha256) {
        throw new Error(
          `Output target "${target.targetPath}" content changed after preparation and no longer matches its SHA-256 expectation`,
        )
      }
    }
  }

  async #publishAll(targets: readonly PublicationTarget[]): Promise<void> {
    try {
      await this.#backUpReplaceableTargets(targets)
      await this.#validateBackedUpExpectedContents(targets)

      for (const target of targets) {
        if (target.definition.policy === "must-not-exist") {
          await this.#promoteWithoutReplacement(target)
        } else {
          await this.#withContext("promote", target.targetPath, () =>
            this.#fileSystem.rename(target.stagingPayload, target.targetPath),
          )
          target.targetOwned = true
        }
      }

      for (const target of targets) {
        target.publicationCommitted = true
      }
    } catch (primaryFailure) {
      const rollbackFailures = await this.#rollback(targets)
      if (rollbackFailures.length > 0) {
        throw aggregateFailure(
          primaryFailure,
          rollbackFailures,
          "Output set publication failed and rollback was incomplete",
        )
      }
      throw primaryFailure
    }

    await this.#removeBackups(targets)
  }

  async #backUpReplaceableTargets(targets: readonly PublicationTarget[]): Promise<void> {
    for (const target of targets) {
      if (
        target.definition.policy !== "replace-existing" ||
        !(await this.#pathExists(target.targetPath))
      ) {
        continue
      }

      await this.#withContext("back up", target.targetPath, () =>
        this.#fileSystem.rename(target.targetPath, target.backupPath),
      )
      target.backupCreated = true
    }
  }

  async #validateBackedUpExpectedContents(targets: readonly PublicationTarget[]): Promise<void> {
    for (const target of targets) {
      if (
        target.definition.kind !== "file" ||
        target.definition.policy !== "replace-existing" ||
        !target.definition.expectedContent
      ) {
        continue
      }
      const expectation = target.definition.expectedContent
      if (!target.backupCreated) {
        if (expectation.state === "sha256") {
          throw new Error(
            `Output target "${target.targetPath}" changed after preparation: it was missing when backed up`,
          )
        }
        continue
      }
      if (expectation.state === "missing") {
        throw new Error(
          `Output target "${target.targetPath}" violated its content expectation: expected it to be missing when backed up`,
        )
      }

      let content: Buffer
      try {
        content = await this.#fileSystem.readFile(target.backupPath)
      } catch (cause) {
        throw new Error(
          `Output target "${target.targetPath}" changed after preparation: could not verify its backed-up SHA-256 content expectation`,
          { cause },
        )
      }
      const actualHash = createHash("sha256").update(content).digest("hex")
      if (actualHash !== expectation.sha256) {
        throw new Error(
          `Output target "${target.targetPath}" content changed after preparation and no longer matches its backed-up SHA-256 expectation`,
        )
      }
    }
  }

  async #promoteWithoutReplacement(target: PublicationTarget): Promise<void> {
    if (target.definition.kind === "file") {
      await this.#withContext("promote without replacement", target.targetPath, () =>
        this.#fileSystem.link(target.stagingPayload, target.targetPath),
      )
      target.targetOwned = true
      return
    }

    await this.#withContext("reserve the must-not-exist path for", target.targetPath, () =>
      this.#fileSystem.mkdir(target.targetPath),
    )
    target.targetOwned = true

    const entries = await this.#withContext("read staged output for", target.targetPath, () =>
      this.#fileSystem.readdir(target.stagingContainer),
    )
    for (const entry of entries) {
      await this.#withContext("promote", target.targetPath, () =>
        this.#fileSystem.rename(
          path.join(target.stagingContainer, entry),
          path.join(target.targetPath, entry),
        ),
      )
    }
  }

  async #removeBackups(targets: readonly PublicationTarget[]): Promise<void> {
    const failures = await this.#collectFailures(
      targets
        .filter((target) => target.backupCreated)
        .map((target) => async () => {
          try {
            await this.#remove(target.backupPath)
            target.backupCreated = false
          } catch (cause) {
            throw new Error(
              `Could not remove the committed backup for output target "${target.targetPath}"; backup artifact: "${target.backupPath}"`,
              { cause },
            )
          }
        }),
    )

    if (failures.length > 0) {
      throw cleanupFailure(failures, "Committed output backup cleanup failed")
    }
  }

  async #rollback(targets: readonly PublicationTarget[]): Promise<unknown[]> {
    const reverseTargets = [...targets].reverse()
    const failures: unknown[] = []
    const failedRemovals = new Set<PublicationTarget>()

    for (const target of reverseTargets) {
      if (!target.targetOwned) {
        continue
      }
      try {
        await this.#remove(target.targetPath)
        target.targetOwned = false
      } catch (cause) {
        failedRemovals.add(target)
        const recovery = target.backupCreated
          ? `recovery backup retained at "${target.backupPath}"`
          : "no previous-target backup exists for this newly created output"
        failures.push(
          new Error(
            `Could not remove promoted output target "${target.targetPath}" during rollback; ${recovery}`,
            { cause },
          ),
        )
      }
    }

    for (const target of reverseTargets) {
      if (!target.backupCreated || failedRemovals.has(target)) {
        continue
      }
      try {
        await this.#fileSystem.rename(target.backupPath, target.targetPath)
        target.backupCreated = false
      } catch (cause) {
        failures.push(
          new Error(
            `Could not restore output target "${target.targetPath}" during rollback; recovery backup retained at "${target.backupPath}"`,
            { cause },
          ),
        )
      }
    }

    return failures
  }

  async #cleanup(
    targets: readonly PublicationTarget[],
    createdParentDirectories: ReadonlySet<string>,
    removeCreatedParents: boolean,
  ): Promise<unknown[]> {
    const failures = await this.#collectFailures(
      targets.flatMap((target) => [
        async () => {
          try {
            await this.#remove(target.stagingContainer)
          } catch (cause) {
            throw new Error(
              `Could not remove staging directory for output target "${target.targetPath}"; staging artifact: "${target.stagingContainer}"`,
              { cause },
            )
          }
        },
        ...(target.publicationCommitted && target.backupCreated
          ? [
              async () => {
                try {
                  await this.#remove(target.backupPath)
                  target.backupCreated = false
                } catch (cause) {
                  throw new Error(
                    `Could not remove committed backup for output target "${target.targetPath}"; backup artifact: "${target.backupPath}"`,
                    { cause },
                  )
                }
              },
            ]
          : []),
      ]),
    )

    if (removeCreatedParents) {
      const deepestFirst = [...createdParentDirectories].sort(
        (left, right) => pathDepth(right) - pathDepth(left),
      )
      for (const directory of deepestFirst) {
        try {
          await this.#fileSystem.rmdir(directory)
        } catch (cause) {
          if (!isMissingPathError(cause) && !isDirectoryNotEmptyError(cause)) {
            failures.push(
              new Error(`Could not remove transaction-created parent directory "${directory}"`, {
                cause,
              }),
            )
          }
        }
      }
    }

    return failures
  }

  async #validatePhysicalTargets(targets: readonly OutputSetTarget[]): Promise<void> {
    const projections: { readonly target: OutputSetTarget; readonly physicalTarget: string }[] = []

    for (const target of targets) {
      const physicalAllowedRoot = await this.#physicalProjection(target.allowedRoot)
      const physicalTarget = await this.#physicalProjection(target.targetPath)
      if (!isStrictDescendant(physicalTarget, physicalAllowedRoot)) {
        throw new Error(
          `Physical output target "${physicalTarget}" is outside allowed root "${physicalAllowedRoot}" (requested as "${target.targetPath}")`,
        )
      }
      projections.push({ target, physicalTarget })
    }

    for (let leftIndex = 0; leftIndex < projections.length; leftIndex += 1) {
      const left = projections[leftIndex]
      if (left === undefined) {
        continue
      }
      for (let rightIndex = leftIndex + 1; rightIndex < projections.length; rightIndex += 1) {
        const right = projections[rightIndex]
        if (right === undefined) {
          continue
        }
        if (samePath(left.physicalTarget, right.physicalTarget)) {
          throw new Error(
            `Physical duplicate output targets: "${left.target.targetPath}" and "${right.target.targetPath}"`,
          )
        }
        if (
          isStrictDescendant(left.physicalTarget, right.physicalTarget) ||
          isStrictDescendant(right.physicalTarget, left.physicalTarget)
        ) {
          throw new Error(
            `Physical overlapping output targets: "${left.target.targetPath}" and "${right.target.targetPath}"`,
          )
        }
      }
    }
  }

  async #physicalProjection(candidate: string): Promise<string> {
    const root = path.parse(candidate).root
    let lexicalPath = root
    let physicalPath = await this.#withContext("resolve the physical path for", candidate, () =>
      this.#fileSystem.realpath(root),
    )
    const segments = path.relative(root, candidate).split(path.sep).filter(Boolean)

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (segment === undefined) {
        continue
      }
      lexicalPath = path.join(lexicalPath, segment)
      try {
        await this.#fileSystem.lstat(lexicalPath)
      } catch (cause) {
        if (isMissingPathError(cause)) {
          return path.resolve(physicalPath, ...segments.slice(index))
        }
        throw contextualError("inspect the physical path for", candidate, cause)
      }
      physicalPath = await this.#withContext("resolve the physical path for", candidate, () =>
        this.#fileSystem.realpath(lexicalPath),
      )
    }

    return path.resolve(physicalPath)
  }

  async #assertMustNotExistTargetsAreAbsent(
    targets: readonly OutputSetTarget[],
    operation: "validate" | "recheck",
  ): Promise<void> {
    for (const target of targets) {
      if (target.policy === "must-not-exist" && (await this.#pathExists(target.targetPath))) {
        throw new Error(
          `Cannot ${operation} output target "${target.targetPath}": it must not exist`,
        )
      }
    }
  }

  async #pathExists(candidate: string): Promise<boolean> {
    try {
      await this.#fileSystem.access(candidate)
      return true
    } catch (error) {
      if (isMissingPathError(error)) {
        return false
      }
      throw contextualError("inspect", candidate, error)
    }
  }

  async #remove(candidate: string): Promise<void> {
    await this.#fileSystem.rm(candidate, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    })
  }

  async #collectFailures(tasks: readonly (() => Promise<void>)[]): Promise<unknown[]> {
    const results = await Promise.allSettled(tasks.map((task) => invokeAsPromise(task)))
    return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []))
  }

  async #withContext<T>(operation: string, targetPath: string, task: () => Promise<T>): Promise<T> {
    try {
      return await task()
    } catch (cause) {
      throw contextualError(operation, targetPath, cause)
    }
  }
}

function validateTargets(targets: readonly OutputSetTarget[]): OutputSetTarget[] {
  if (targets.length === 0) {
    throw new Error("An output set must contain at least one target")
  }

  const normalized = targets.map((target) => {
    const targetPath = path.resolve(target.targetPath)
    const allowedRoot = path.resolve(target.allowedRoot)

    if (isFileSystemRoot(targetPath) || isFileSystemRoot(allowedRoot)) {
      throw new Error(`Unsafe output target or allowed root: ${targetPath}`)
    }
    if (!isStrictDescendant(targetPath, allowedRoot)) {
      throw new Error(`Output target "${targetPath}" is outside allowed root "${allowedRoot}"`)
    }
    if (!isOutputTargetPolicy(target.policy)) {
      throw new Error(`Unsupported output target policy: ${String(target.policy)}`)
    }

    return { ...target, targetPath, allowedRoot }
  })

  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    const left = normalized[leftIndex]
    if (left === undefined) {
      continue
    }
    for (let rightIndex = leftIndex + 1; rightIndex < normalized.length; rightIndex += 1) {
      const right = normalized[rightIndex]
      if (right === undefined) {
        continue
      }
      if (samePath(left.targetPath, right.targetPath)) {
        throw new Error(`Duplicate output target: ${left.targetPath}`)
      }
      if (
        isStrictDescendant(left.targetPath, right.targetPath) ||
        isStrictDescendant(right.targetPath, left.targetPath)
      ) {
        throw new Error(
          `Overlapping output targets: "${left.targetPath}" and "${right.targetPath}"`,
        )
      }
    }
  }

  return normalized
}

function isStrictDescendant(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate)
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function samePath(left: string, right: string): boolean {
  if (process.platform === "win32") {
    return left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US")
  }
  return left === right
}

function isFileSystemRoot(candidate: string): boolean {
  return samePath(candidate, path.parse(candidate).root)
}

function isOutputTargetPolicy(policy: string): policy is OutputTargetPolicy {
  return outputTargetPolicies.some((candidate) => candidate === policy)
}

function isMissingPathError(error: unknown): boolean {
  return hasErrorCode(error, "ENOENT") || hasErrorCode(error, "ENOTDIR")
}

function isDirectoryNotEmptyError(error: unknown): boolean {
  return hasErrorCode(error, "ENOTEMPTY") || hasErrorCode(error, "EEXIST")
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

function pathDepth(candidate: string): number {
  return candidate.split(path.sep).length
}

function contextualError(operation: string, targetPath: string, cause: unknown): Error {
  return new Error(`Could not ${operation} output target "${targetPath}"`, { cause })
}

function aggregateFailure(
  primary: unknown,
  secondary: readonly unknown[],
  message: string,
): AggregateError {
  return new AggregateError([primary, ...secondary], message, { cause: primary })
}

function cleanupFailure(failures: readonly unknown[], message: string): unknown {
  if (failures.length === 1) {
    return failures[0]
  }
  return new AggregateError(failures, message, { cause: failures[0] })
}
