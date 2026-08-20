import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  access,
  link as createLink,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import type {
  OutputFileTarget,
  OutputSetTarget,
} from "../../application/ports/output-set-publisher.ts"
import {
  type TransactionalOutputSetFileSystem,
  TransactionalOutputSetPublisher,
} from "./transactional-output-set-publisher.ts"

type Builder = OutputSetTarget["build"]

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "vsrg-output-set-"))
}

function target(
  allowedRoot: string,
  name: string,
  policy: OutputSetTarget["policy"] = "replace-existing",
  build: Builder = async () => {},
): OutputSetTarget {
  return { kind: "directory", targetPath: path.join(allowedRoot, name), allowedRoot, policy, build }
}

function fileTarget(
  allowedRoot: string,
  name: string,
  policy: OutputSetTarget["policy"] = "replace-existing",
  build: OutputFileTarget["build"] = async (stagingFile) => writeFile(stagingFile, "file"),
  expectedContent?: OutputFileTarget["expectedContent"],
): OutputFileTarget {
  return {
    kind: "file",
    targetPath: path.join(allowedRoot, name),
    allowedRoot,
    policy,
    build,
    expectedContent,
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

async function assertOnlyTargets(parent: string, names: readonly string[]): Promise<void> {
  assert.deepEqual((await readdir(parent)).sort(), [...names].sort())
}

function isLinkCapabilityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EACCES" || error.code === "ENOSYS")
  )
}

function aggregateErrors(error: AggregateError): readonly unknown[] {
  return error.errors as readonly unknown[]
}

function errorTreeContains(error: unknown, expected: unknown): boolean {
  if (error === expected) {
    return true
  }
  if (error instanceof AggregateError) {
    return (
      errorTreeContains(error.cause, expected) ||
      aggregateErrors(error).some((candidate) => errorTreeContains(candidate, expected))
    )
  }
  return error instanceof Error && errorTreeContains(error.cause, expected)
}

test("rejects an empty output set", async () => {
  await assert.rejects(() => new TransactionalOutputSetPublisher().publish([]), /at least one/i)
})

test("rejects unsafe targets and allowed roots before starting a builder", async (context) => {
  const root = await makeRoot()
  let builds = 0
  const build = async () => {
    builds += 1
  }

  try {
    const cases: readonly [string, OutputSetTarget][] = [
      [
        "filesystem target root",
        {
          ...target(root, "valid", "replace-existing", build),
          targetPath: path.parse(root).root,
        },
      ],
      [
        "filesystem allowed root",
        target(path.parse(root).root, "valid", "replace-existing", build),
      ],
      [
        "target equal to allowed root",
        { ...target(root, "valid", "replace-existing", build), targetPath: root },
      ],
      [
        "target outside allowed root",
        {
          ...target(root, "valid", "replace-existing", build),
          targetPath: path.join(path.dirname(root), "outside"),
        },
      ],
    ]

    for (const [name, unsafeTarget] of cases) {
      await context.test(name, async () => {
        await assert.rejects(
          () => new TransactionalOutputSetPublisher().publish([unsafeTarget]),
          /unsafe|outside|root/i,
        )
      })
    }

    assert.equal(builds, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects duplicate and overlapping targets before starting builders", async (context) => {
  const root = await makeRoot()
  let builds = 0
  const build = async () => {
    builds += 1
  }

  try {
    const output = path.join(root, "output")
    const cases: readonly [string, readonly OutputSetTarget[]][] = [
      [
        "duplicates",
        [
          {
            kind: "directory",
            targetPath: output,
            allowedRoot: root,
            policy: "replace-existing",
            build,
          },
          {
            kind: "directory",
            targetPath: path.join(root, ".", "output"),
            allowedRoot: root,
            policy: "must-not-exist",
            build,
          },
        ],
      ],
      [
        "overlap",
        [
          {
            kind: "directory",
            targetPath: output,
            allowedRoot: root,
            policy: "replace-existing",
            build,
          },
          {
            kind: "directory",
            targetPath: path.join(output, "child"),
            allowedRoot: root,
            policy: "must-not-exist",
            build,
          },
        ],
      ],
    ]

    for (const [name, unsafeTargets] of cases) {
      await context.test(name, async () => {
        await assert.rejects(
          () => new TransactionalOutputSetPublisher().publish(unsafeTargets),
          /duplicate|overlap/i,
        )
      })
    }

    assert.equal(builds, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects an existing must-not-exist target before starting any builder", async () => {
  const root = await makeRoot()
  const existing = target(root, "profile", "must-not-exist", async () => {
    assert.fail("must not build")
  })

  try {
    await mkdir(existing.targetPath)
    await writeFile(path.join(existing.targetPath, "owner.txt"), "someone else")

    await assert.rejects(
      () => new TransactionalOutputSetPublisher().publish([existing]),
      /must not exist|already exists/i,
    )
    assert.equal(
      await readFile(path.join(existing.targetPath, "owner.txt"), "utf8"),
      "someone else",
    )
    await assertOnlyTargets(root, ["profile"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("starts and settles every builder before changing a target after a synchronous failure", async () => {
  const root = await makeRoot()
  const first = target(root, "first")
  const second = target(root, "second")
  const failure = new Error("synchronous builder failure")
  let markSecondStarted: (() => void) | undefined
  const secondStarted = new Promise<void>((resolve) => {
    markSecondStarted = resolve
  })
  let releaseSecond: (() => void) | undefined
  const secondCanSettle = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })

  try {
    await Promise.all(
      [first, second].map(async ({ targetPath }) => {
        await mkdir(targetPath)
        await writeFile(path.join(targetPath, "current.txt"), path.basename(targetPath))
      }),
    )

    const publication = new TransactionalOutputSetPublisher().publish([
      {
        ...first,
        build: () => {
          throw failure
        },
      },
      {
        ...second,
        build: async (workspace) => {
          markSecondStarted?.()
          await writeFile(path.join(workspace, "fresh.txt"), "fresh")
          await secondCanSettle
        },
      },
    ])

    await secondStarted
    assert.equal(await readFile(path.join(first.targetPath, "current.txt"), "utf8"), "first")
    assert.equal(await readFile(path.join(second.targetPath, "current.txt"), "utf8"), "second")

    releaseSecond?.()
    await assert.rejects(publication, (error) => {
      assert(error instanceof Error)
      assert.match(error.message, /build.*first/i)
      assert.equal(error.cause, failure)
      return true
    })
    await assertOnlyTargets(root, ["first", "second"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("reports the first input-order builder failure after every asynchronous builder settles", async () => {
  const root = await makeRoot()
  const firstFailure = new Error("first input failure")
  const secondFailure = new Error("second input failure")
  let releaseFirst: (() => void) | undefined
  const firstCanFail = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let markSecondSettled: (() => void) | undefined
  const secondSettled = new Promise<void>((resolve) => {
    markSecondSettled = resolve
  })

  try {
    const publication = new TransactionalOutputSetPublisher().publish([
      target(root, "first", "replace-existing", async () => {
        await firstCanFail
        throw firstFailure
      }),
      target(root, "second", "replace-existing", async () => {
        markSecondSettled?.()
        throw secondFailure
      }),
    ])

    await secondSettled
    releaseFirst?.()

    await assert.rejects(publication, (error) => {
      assert(error instanceof Error)
      assert.match(error.message, /build.*first/i)
      assert.equal(error.cause, firstFailure)
      return true
    })
    assert.deepEqual(await readdir(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("publishes replace-existing and must-not-exist targets and removes transaction artifacts", async () => {
  const root = await makeRoot()
  const noteSkin = target(root, "noteskin", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new noteskin")
  })
  const profile = target(root, "profile", "must-not-exist", async (workspace) => {
    await mkdir(path.join(workspace, "nested"))
    await writeFile(path.join(workspace, "profile.txt"), "new profile")
    await writeFile(path.join(workspace, "nested", "data.txt"), "nested data")
  })

  try {
    await mkdir(noteSkin.targetPath)
    await writeFile(path.join(noteSkin.targetPath, "old.txt"), "old")

    await new TransactionalOutputSetPublisher().publish([noteSkin, profile])

    assert.deepEqual(await readdir(noteSkin.targetPath), ["new.txt"])
    assert.equal(
      await readFile(path.join(profile.targetPath, "profile.txt"), "utf8"),
      "new profile",
    )
    assert.equal(
      await readFile(path.join(profile.targetPath, "nested", "data.txt"), "utf8"),
      "nested data",
    )
    await assertOnlyTargets(root, ["noteskin", "profile"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("restores every previous target when any rename boundary fails", async (context) => {
  for (const failingRename of [1, 2, 3, 4]) {
    await context.test(`rename ${failingRename}`, async () => {
      const root = await makeRoot()
      const first = target(root, "first", "replace-existing", async (workspace) => {
        await writeFile(path.join(workspace, "fresh.bin"), Buffer.from([10, 11]))
      })
      const second = target(root, "second", "replace-existing", async (workspace) => {
        await writeFile(path.join(workspace, "fresh.bin"), Buffer.from([12, 13]))
      })
      const firstBytes = Buffer.from([0, 1, 2, 255])
      const secondBytes = Buffer.from([3, 4, 5, 254])
      const boundaryFailure = new Error(`rename ${failingRename} failed`)
      let renameCount = 0
      const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
        rename: async (source, destination) => {
          renameCount += 1
          if (renameCount === failingRename) {
            throw boundaryFailure
          }
          await rename(source, destination)
        },
      }

      try {
        await mkdir(first.targetPath)
        await mkdir(second.targetPath)
        await writeFile(path.join(first.targetPath, "current.bin"), firstBytes)
        await writeFile(path.join(second.targetPath, "current.bin"), secondBytes)

        await assert.rejects(
          () => new TransactionalOutputSetPublisher(fileSystem).publish([first, second]),
          (error) => {
            assert(error instanceof Error)
            assert.match(error.message, /rename|back up|promote/i)
            assert.equal(error.cause, boundaryFailure)
            return true
          },
        )

        assert.deepEqual(await readFile(path.join(first.targetPath, "current.bin")), firstBytes)
        assert.deepEqual(await readFile(path.join(second.targetPath, "current.bin")), secondBytes)
        await assertOnlyTargets(root, ["first", "second"])
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }
})

test("removes a newly promoted profile and restores a NoteSkin when a later promotion fails", async () => {
  const root = await makeRoot()
  const profile = target(root, "profile", "must-not-exist", async (workspace) => {
    await writeFile(path.join(workspace, "profile.txt"), "new profile")
  })
  const noteSkin = target(root, "noteskin", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.bin"), Buffer.from([90, 91]))
  })
  const previousBytes = Buffer.from([0, 127, 128, 255])
  const promotionFailure = new Error("NoteSkin promotion failed")
  let promotionFailed = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rename: async (source, destination) => {
      if (destination === noteSkin.targetPath && !promotionFailed) {
        promotionFailed = true
        throw promotionFailure
      }
      await rename(source, destination)
    },
  }

  try {
    await mkdir(noteSkin.targetPath)
    await writeFile(path.join(noteSkin.targetPath, "current.bin"), previousBytes)

    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([profile, noteSkin]),
      (error) => error instanceof Error && error.cause === promotionFailure,
    )

    assert.equal(await exists(profile.targetPath), false)
    assert.deepEqual(await readFile(path.join(noteSkin.targetPath, "current.bin")), previousBytes)
    await assertOnlyTargets(root, ["noteskin"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("does not delete a backup before every promotion succeeds", async () => {
  const root = await makeRoot()
  const first = target(root, "first", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new first")
  })
  const second = target(root, "second", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new second")
  })
  const failure = new Error("last promotion failed")
  const deletedExistingBackups: string[] = []
  let promotionFailed = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rename: async (source, destination) => {
      if (destination === second.targetPath && !promotionFailed) {
        promotionFailed = true
        throw failure
      }
      await rename(source, destination)
    },
    rm: async (candidate, options) => {
      if (path.basename(candidate).includes(".backup-") && (await exists(candidate))) {
        deletedExistingBackups.push(candidate)
      }
      await rm(candidate, options)
    },
  }

  try {
    for (const output of [first, second]) {
      await mkdir(output.targetPath)
      await writeFile(path.join(output.targetPath, "old.txt"), path.basename(output.targetPath))
    }

    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([first, second]),
      (error) => error instanceof Error && error.cause === failure,
    )

    assert.deepEqual(deletedExistingBackups, [])
    await assertOnlyTargets(root, ["first", "second"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("settles and retries committed backup cleanup while preserving the first failure", async () => {
  const root = await makeRoot()
  const first = target(root, "first", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new first")
  })
  const second = target(root, "second", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new second")
  })
  const firstFailure = new Error("first backup cleanup failed")
  const secondFailure = new Error("second backup cleanup failed")
  const failedBackups = new Set<string>()

  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rm: async (candidate, options) => {
      const name = path.basename(candidate)
      if (name.includes(".backup-") && !failedBackups.has(candidate)) {
        failedBackups.add(candidate)
        throw name.startsWith(".first.") ? firstFailure : secondFailure
      }
      await rm(candidate, options)
    },
  }

  try {
    for (const output of [first, second]) {
      await mkdir(output.targetPath)
      await writeFile(path.join(output.targetPath, "old.txt"), "old")
    }

    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([first, second]),
      (error) => {
        assert(error instanceof AggregateError)
        assert(error.cause instanceof Error)
        assert.equal(error.cause.cause, firstFailure)
        assert(
          aggregateErrors(error).some(
            (candidate) => candidate instanceof Error && candidate.cause === secondFailure,
          ),
        )
        return true
      },
    )

    assert.equal(await readFile(path.join(first.targetPath, "new.txt"), "utf8"), "new first")
    assert.equal(await readFile(path.join(second.targetPath, "new.txt"), "utf8"), "new second")
    assert.equal(failedBackups.size, 2)
    await assertOnlyTargets(root, ["first", "second"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("atomically refuses a must-not-exist target created immediately before promotion", async () => {
  const root = await makeRoot()
  const profile = target(root, "profile", "must-not-exist", async (workspace) => {
    await writeFile(path.join(workspace, "ours.txt"), "ours")
  })
  let raced = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    mkdir: async (candidate, options) => {
      if (candidate === profile.targetPath && options?.recursive !== true && !raced) {
        raced = true
        await mkdir(candidate)
        await writeFile(path.join(candidate, "theirs.txt"), "theirs")
      }
      return mkdir(candidate, options)
    },
  }

  try {
    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([profile]),
      (error) => {
        assert(error instanceof Error)
        assert.match(error.message, /reserve|must not exist|promot/i)
        return true
      },
    )

    assert.equal(raced, true)
    assert.equal(await readFile(path.join(profile.targetPath, "theirs.txt"), "utf8"), "theirs")
    assert.equal(await exists(path.join(profile.targetPath, "ours.txt")), false)
    await assertOnlyTargets(root, ["profile"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects a target that escapes its allowed root through a directory alias", async (context) => {
  const root = await makeRoot()
  const allowedRoot = path.join(root, "allowed")
  const outside = path.join(root, "outside")
  const alias = path.join(allowedRoot, "escape")
  let builds = 0

  try {
    await mkdir(allowedRoot)
    await mkdir(outside)
    try {
      await symlink(outside, alias, process.platform === "win32" ? "junction" : "dir")
    } catch (error) {
      if (isLinkCapabilityError(error)) {
        context.skip(`directory aliases are unavailable: ${String(error)}`)
        return
      }
      throw error
    }

    await assert.rejects(
      () =>
        new TransactionalOutputSetPublisher().publish([
          target(allowedRoot, path.join("escape", "output"), "replace-existing", async () => {
            builds += 1
          }),
        ]),
      /physical|outside allowed root|alias/i,
    )
    assert.equal(builds, 0)
    assert.deepEqual(await readdir(outside), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects physically duplicate targets reached through different aliases", async (context) => {
  const root = await makeRoot()
  const allowedRoot = path.join(root, "allowed")
  const realDirectory = path.join(allowedRoot, "real")
  const alias = path.join(allowedRoot, "alias")
  let builds = 0
  const build = async () => {
    builds += 1
  }

  try {
    await mkdir(realDirectory, { recursive: true })
    try {
      await symlink(realDirectory, alias, process.platform === "win32" ? "junction" : "dir")
    } catch (error) {
      if (isLinkCapabilityError(error)) {
        context.skip(`directory aliases are unavailable: ${String(error)}`)
        return
      }
      throw error
    }

    await assert.rejects(
      () =>
        new TransactionalOutputSetPublisher().publish([
          target(allowedRoot, path.join("real", "output"), "replace-existing", build),
          target(allowedRoot, path.join("alias", "output"), "replace-existing", build),
        ]),
      /physical.*duplicate|duplicate.*physical/i,
    )
    assert.equal(builds, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects physically overlapping targets reached through an alias", async (context) => {
  const root = await makeRoot()
  const allowedRoot = path.join(root, "allowed")
  const realDirectory = path.join(allowedRoot, "real")
  const alias = path.join(allowedRoot, "alias")
  let builds = 0
  const build = async () => {
    builds += 1
  }

  try {
    await mkdir(realDirectory, { recursive: true })
    try {
      await symlink(realDirectory, alias, process.platform === "win32" ? "junction" : "dir")
    } catch (error) {
      if (isLinkCapabilityError(error)) {
        context.skip(`directory aliases are unavailable: ${String(error)}`)
        return
      }
      throw error
    }

    await assert.rejects(
      () =>
        new TransactionalOutputSetPublisher().publish([
          target(allowedRoot, "real", "replace-existing", build),
          target(allowedRoot, path.join("alias", "child"), "replace-existing", build),
        ]),
      /physical.*overlap|overlap.*physical/i,
    )
    assert.equal(builds, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rechecks physical containment after a parent alias appears during preparation", async (context) => {
  const root = await makeRoot()
  const allowedRoot = path.join(root, "allowed")
  const outside = path.join(root, "outside")
  const alias = path.join(allowedRoot, "late-alias")
  const probe = path.join(allowedRoot, "alias-probe")
  let aliasInspections = 0
  let outsideNestedWasCreated = false
  let builds = 0

  try {
    await mkdir(allowedRoot)
    await mkdir(outside)
    try {
      await symlink(outside, probe, process.platform === "win32" ? "junction" : "dir")
      await rm(probe, { force: true })
    } catch (error) {
      if (isLinkCapabilityError(error)) {
        context.skip(`directory aliases are unavailable: ${String(error)}`)
        return
      }
      throw error
    }

    const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
      lstat: async (candidate) => {
        if (candidate === alias) {
          aliasInspections += 1
          if (aliasInspections === 2) {
            await symlink(outside, alias, process.platform === "win32" ? "junction" : "dir")
          }
        }
        return lstat(candidate)
      },
      mkdir: async (candidate, options) => {
        const created = await mkdir(candidate, options)
        if (candidate === path.join(alias, "nested")) {
          outsideNestedWasCreated = await exists(path.join(outside, "nested"))
        }
        return created
      },
    }

    await assert.rejects(
      () =>
        new TransactionalOutputSetPublisher(fileSystem).publish([
          target(
            allowedRoot,
            path.join("late-alias", "nested", "output"),
            "replace-existing",
            async () => {
              builds += 1
            },
          ),
        ]),
      /physical|outside allowed root|alias/i,
    )
    assert.equal(aliasInspections >= 2, true)
    assert.equal(outsideNestedWasCreated, false)
    assert.equal(builds, 0)
    assert.deepEqual(await readdir(outside), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rolls back a must-not-exist target when moving a staged entry fails", async () => {
  const root = await makeRoot()
  const profile = target(root, "profile", "must-not-exist", async (workspace) => {
    await writeFile(path.join(workspace, "first.txt"), "first")
    await writeFile(path.join(workspace, "second.txt"), "second")
  })
  const moveFailure = new Error("staged entry move failed")
  let stagedEntryMoves = 0
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rename: async (source, destination) => {
      if (path.dirname(destination) === profile.targetPath) {
        stagedEntryMoves += 1
      }
      if (stagedEntryMoves === 2 && path.dirname(destination) === profile.targetPath) {
        throw moveFailure
      }
      await rename(source, destination)
    },
  }

  try {
    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([profile]),
      (error) => error instanceof Error && error.cause === moveFailure,
    )
    assert.equal(stagedEntryMoves, 2)
    assert.equal(await exists(profile.targetPath), false)
    assert.deepEqual(await readdir(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("surfaces rollback removal failure and does not silently restore over the owned target", async () => {
  const root = await makeRoot()
  const first = target(root, "first", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new first")
  })
  const second = target(root, "second", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new second")
  })
  const promotionFailure = new Error("second promotion failed")
  const removalFailure = new Error("first removal failed")
  let promotionFailed = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rename: async (source, destination) => {
      if (destination === second.targetPath && !promotionFailed) {
        promotionFailed = true
        throw promotionFailure
      }
      await rename(source, destination)
    },
    rm: async (candidate, options) => {
      if (candidate === first.targetPath) {
        throw removalFailure
      }
      await rm(candidate, options)
    },
  }

  try {
    for (const output of [first, second]) {
      await mkdir(output.targetPath)
      await writeFile(
        path.join(output.targetPath, "old.txt"),
        `old ${path.basename(output.targetPath)}`,
      )
    }

    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([first, second]),
      (error) => {
        assert(error instanceof AggregateError)
        assert(error.cause instanceof Error)
        assert.equal(error.cause.cause, promotionFailure)
        const rollbackFailure = aggregateErrors(error).find(
          (candidate) => candidate instanceof Error && candidate.cause === removalFailure,
        )
        assert(rollbackFailure instanceof Error)
        assert.match(rollbackFailure.message, /remove.*first.*rollback.*backup/i)
        return true
      },
    )
    assert.equal(await readFile(path.join(first.targetPath, "new.txt"), "utf8"), "new first")
    assert.equal(await readFile(path.join(second.targetPath, "old.txt"), "utf8"), "old second")
    assert((await readdir(root)).some((entry) => entry.startsWith(".first.backup-")))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("surfaces backup restoration failure and reports the retained recovery artifact", async () => {
  const root = await makeRoot()
  const first = target(root, "first", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new first")
  })
  const second = target(root, "second", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new second")
  })
  const promotionFailure = new Error("second promotion failed")
  const restoreFailure = new Error("first restore failed")
  let promotionFailed = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rename: async (source, destination) => {
      if (destination === second.targetPath && !promotionFailed) {
        promotionFailed = true
        throw promotionFailure
      }
      if (path.basename(source).startsWith(".first.backup-") && destination === first.targetPath) {
        throw restoreFailure
      }
      await rename(source, destination)
    },
  }

  try {
    for (const output of [first, second]) {
      await mkdir(output.targetPath)
      await writeFile(
        path.join(output.targetPath, "old.txt"),
        `old ${path.basename(output.targetPath)}`,
      )
    }

    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([first, second]),
      (error) => {
        assert(error instanceof AggregateError)
        assert(error.cause instanceof Error)
        assert.equal(error.cause.cause, promotionFailure)
        const rollbackFailure = aggregateErrors(error).find(
          (candidate) => candidate instanceof Error && candidate.cause === restoreFailure,
        )
        assert(rollbackFailure instanceof Error)
        assert.match(rollbackFailure.message, /restore.*first.*backup/i)
        return true
      },
    )

    const entries = await readdir(root)
    assert(entries.some((entry) => entry.startsWith(".first.backup-")))
    assert.equal(await exists(first.targetPath), false)
    assert.equal(await readFile(path.join(second.targetPath, "old.txt"), "utf8"), "old second")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects a successful publication when persistent staging cleanup fails", async () => {
  const root = await makeRoot()
  const profile = target(root, "profile", "must-not-exist", async () => {})
  const cleanupFailure = new Error("persistent staging cleanup failure")
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rm: async (candidate, options) => {
      if (path.basename(candidate).includes(".staging-")) {
        throw cleanupFailure
      }
      await rm(candidate, options)
    },
  }

  try {
    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([profile]),
      (error) => error instanceof Error && error.cause === cleanupFailure,
    )
    assert.equal(await exists(profile.targetPath), true)
    assert((await readdir(root)).some((entry) => entry.includes(".staging-")))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("preserves a build failure and reports persistent staging cleanup failures", async () => {
  const root = await makeRoot()
  const buildFailure = new Error("primary build failure")
  const cleanupFailure = new Error("secondary staging cleanup failure")
  const output = target(root, "output", "replace-existing", async () => {
    throw buildFailure
  })
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rm: async (candidate, options) => {
      if (path.basename(candidate).includes(".staging-")) {
        throw cleanupFailure
      }
      await rm(candidate, options)
    },
  }

  try {
    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([output]),
      (error) => {
        assert(error instanceof AggregateError)
        assert(error.cause instanceof Error)
        assert.equal(error.cause.cause, buildFailure)
        assert.equal(aggregateErrors(error)[0], error.cause)
        assert(
          aggregateErrors(error).some(
            (candidate) => candidate instanceof Error && candidate.cause === cleanupFailure,
          ),
        )
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("retains promotion, rollback, and cleanup failures in one aggregate error tree", async () => {
  const root = await makeRoot()
  const first = target(root, "first", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new first")
  })
  const second = target(root, "second", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new second")
  })
  const promotionFailure = new Error("promotion failed")
  const restoreFailure = new Error("restore failed")
  const cleanupFailure = new Error("cleanup failed")
  let promotionFailed = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rename: async (source, destination) => {
      if (destination === second.targetPath && !promotionFailed) {
        promotionFailed = true
        throw promotionFailure
      }
      if (path.basename(source).startsWith(".first.backup-") && destination === first.targetPath) {
        throw restoreFailure
      }
      await rename(source, destination)
    },
    rm: async (candidate, options) => {
      if (path.basename(candidate).includes(".staging-")) {
        throw cleanupFailure
      }
      await rm(candidate, options)
    },
  }

  try {
    for (const output of [first, second]) {
      await mkdir(output.targetPath)
      await writeFile(path.join(output.targetPath, "old.txt"), "old")
    }

    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([first, second]),
      (error) => {
        assert(error instanceof AggregateError)
        assert.equal(aggregateErrors(error)[0], error.cause)
        assert.equal(errorTreeContains(error, promotionFailure), true)
        assert.equal(errorTreeContains(error, restoreFailure), true)
        assert.equal(errorTreeContains(error, cleanupFailure), true)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("preserves a concurrent replace-existing creator when promotion loses the race", async () => {
  const root = await makeRoot()
  const output = target(root, "output", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "ours.txt"), "ours")
  })
  let raced = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rename: async (source, destination) => {
      if (
        destination === output.targetPath &&
        path.basename(source).includes(".staging-") &&
        !raced
      ) {
        raced = true
        await mkdir(destination)
        await writeFile(path.join(destination, "theirs.txt"), "theirs")
      }
      await rename(source, destination)
    },
  }

  try {
    await assert.rejects(() => new TransactionalOutputSetPublisher(fileSystem).publish([output]))
    assert.equal(raced, true)
    assert.equal(await readFile(path.join(output.targetPath, "theirs.txt"), "utf8"), "theirs")
    assert.equal(await exists(path.join(output.targetPath, "ours.txt")), false)
    await assertOnlyTargets(root, ["output"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("removes transaction-created empty parent directories after a build failure", async () => {
  const root = await makeRoot()
  const allowedRoot = path.join(root, "allowed")
  const failure = new Error("build failed")

  try {
    await mkdir(allowedRoot)
    await assert.rejects(
      () =>
        new TransactionalOutputSetPublisher().publish([
          target(
            allowedRoot,
            path.join("created", "nested", "output"),
            "replace-existing",
            async () => {
              throw failure
            },
          ),
        ]),
      (error) => error instanceof Error && error.cause === failure,
    )
    assert.deepEqual(await readdir(allowedRoot), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("publishes an empty must-not-exist workspace", async () => {
  const root = await makeRoot()
  const output = target(root, "empty", "must-not-exist", async () => {})

  try {
    await new TransactionalOutputSetPublisher().publish([output])
    assert.deepEqual(await readdir(output.targetPath), [])
    await assertOnlyTargets(root, ["empty"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("publishes new and replacement file targets without leaving transaction artifacts", async () => {
  const root = await makeRoot()
  const created = fileTarget(root, "created.png", "must-not-exist", async (stagingFile) => {
    await writeFile(stagingFile, "created")
  })
  const replaced = fileTarget(root, "replaced.lua", "replace-existing", async (stagingFile) => {
    await writeFile(stagingFile, "replacement")
  })
  try {
    await writeFile(replaced.targetPath, "original")

    await new TransactionalOutputSetPublisher().publish([created, replaced])

    assert.equal(await readFile(created.targetPath, "utf8"), "created")
    assert.equal(await readFile(replaced.targetPath, "utf8"), "replacement")
    await assertOnlyTargets(root, ["created.png", "replaced.lua"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("publishes directory and file targets in one output transaction", async () => {
  const root = await makeRoot()
  const directory = target(root, "noteskin", "must-not-exist", async (workspace) => {
    await writeFile(path.join(workspace, "NoteSkin.lua"), "return {}")
  })
  const judgement = fileTarget(root, "judgement.png", "must-not-exist", async (stagingFile) => {
    await writeFile(stagingFile, "png")
  })
  try {
    await new TransactionalOutputSetPublisher().publish([directory, judgement])

    assert.equal(
      await readFile(path.join(directory.targetPath, "NoteSkin.lua"), "utf8"),
      "return {}",
    )
    assert.equal(await readFile(judgement.targetPath, "utf8"), "png")
    await assertOnlyTargets(root, ["noteskin", "judgement.png"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("validates file content expectations before backing up any target", async () => {
  const root = await makeRoot()
  const configPath = path.join(root, "assetsConfig.lua")
  const original = Buffer.from("original")
  try {
    await writeFile(configPath, original)
    const matching = fileTarget(
      root,
      "assetsConfig.lua",
      "replace-existing",
      async (stagingFile) => writeFile(stagingFile, "updated"),
      { state: "sha256", sha256: createHash("sha256").update(original).digest("hex") },
    )
    await new TransactionalOutputSetPublisher().publish([matching])
    assert.equal(await readFile(configPath, "utf8"), "updated")

    await writeFile(configPath, "changed concurrently")
    const mismatched = fileTarget(
      root,
      "assetsConfig.lua",
      "replace-existing",
      async (stagingFile) => writeFile(stagingFile, "must not publish"),
      { state: "sha256", sha256: createHash("sha256").update(original).digest("hex") },
    )
    await assert.rejects(
      () => new TransactionalOutputSetPublisher().publish([mismatched]),
      /content.*changed|expectation|sha-?256/i,
    )
    assert.equal(await readFile(configPath, "utf8"), "changed concurrently")

    const expectedMissing = fileTarget(
      root,
      "assetsConfig.lua",
      "replace-existing",
      async (stagingFile) => writeFile(stagingFile, "must not publish"),
      { state: "missing" },
    )
    await assert.rejects(
      () => new TransactionalOutputSetPublisher().publish([expectedMissing]),
      /expected.*missing|content expectation/i,
    )
    assert.equal(await readFile(configPath, "utf8"), "changed concurrently")
    await assertOnlyTargets(root, ["assetsConfig.lua"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("preserves a SHA-256 target changed between live validation and backup", async () => {
  const root = await makeRoot()
  const skin = target(root, "skin", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new skin")
  })
  const configPath = path.join(root, "osu!.Audit.cfg")
  const originalConfig = Buffer.from("ManiaSpeed = 10\n")
  const concurrentConfig = "ManiaSpeed = 777\nConcurrent = keep\n"
  let changedAfterValidation = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    readFile: async (candidate) => {
      const content = await readFile(candidate)
      if (!changedAfterValidation && candidate === configPath) {
        changedAfterValidation = true
        await writeFile(configPath, concurrentConfig)
      }
      return content
    },
  }

  try {
    await mkdir(skin.targetPath)
    await writeFile(path.join(skin.targetPath, "old.txt"), "old skin")
    await writeFile(configPath, originalConfig)
    const config = fileTarget(
      root,
      "osu!.Audit.cfg",
      "replace-existing",
      async (stagingFile) => writeFile(stagingFile, "ManiaSpeed = 29\n"),
      {
        state: "sha256",
        sha256: createHash("sha256").update(originalConfig).digest("hex"),
      },
    )

    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([skin, config]),
      /content.*changed|expectation|sha-?256/i,
    )

    assert.equal(changedAfterValidation, true)
    assert.equal(await readFile(configPath, "utf8"), concurrentConfig)
    assert.deepEqual(await readdir(skin.targetPath), ["old.txt"])
    assert.equal(await readFile(path.join(skin.targetPath, "old.txt"), "utf8"), "old skin")
    await assertOnlyTargets(root, ["skin", "osu!.Audit.cfg"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("preserves a missing-expected file created between live validation and backup", async () => {
  const root = await makeRoot()
  const skin = target(root, "skin", "replace-existing", async (workspace) => {
    await writeFile(path.join(workspace, "new.txt"), "new skin")
  })
  const configPath = path.join(root, "osu!.Audit.cfg")
  const concurrentConfig = "ManiaSpeed = 777\nConcurrent = keep\n"
  let createdAfterValidation = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    access: async (candidate) => {
      try {
        await access(candidate)
      } catch (cause) {
        if (!createdAfterValidation && candidate === configPath) {
          createdAfterValidation = true
          await writeFile(configPath, concurrentConfig)
        }
        throw cause
      }
    },
  }

  try {
    await mkdir(skin.targetPath)
    await writeFile(path.join(skin.targetPath, "old.txt"), "old skin")
    const config = fileTarget(
      root,
      "osu!.Audit.cfg",
      "replace-existing",
      async (stagingFile) => writeFile(stagingFile, "ManiaSpeed = 29\n"),
      { state: "missing" },
    )

    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([skin, config]),
      /expected.*missing|content expectation/i,
    )

    assert.equal(createdAfterValidation, true)
    assert.equal(await readFile(configPath, "utf8"), concurrentConfig)
    assert.deepEqual(await readdir(skin.targetPath), ["old.txt"])
    assert.equal(await readFile(path.join(skin.targetPath, "old.txt"), "utf8"), "old skin")
    await assertOnlyTargets(root, ["skin", "osu!.Audit.cfg"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects file builders that do not create one regular staging file", async () => {
  const root = await makeRoot()
  try {
    await assert.rejects(
      () =>
        new TransactionalOutputSetPublisher().publish([
          fileTarget(root, "missing.png", "must-not-exist", async () => {}),
        ]),
      /staged.*file|regular file/i,
    )
    await assert.rejects(
      () =>
        new TransactionalOutputSetPublisher().publish([
          fileTarget(root, "directory.png", "must-not-exist", async (stagingFile) => {
            await mkdir(stagingFile)
          }),
        ]),
      /staged.*file|regular file/i,
    )
    assert.deepEqual(await readdir(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("atomically refuses a raced must-not-exist file without replacing the winner", async () => {
  const root = await makeRoot()
  const output = fileTarget(root, "judgement.png", "must-not-exist", async (stagingFile) => {
    await writeFile(stagingFile, "ours")
  })
  let raced = false
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    link: async (existingPath, newPath) => {
      if (!raced) {
        raced = true
        await writeFile(newPath, "theirs")
      }
      await createLink(existingPath, newPath)
    },
  }
  try {
    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([output]),
      /promote without replacement|must not exist/i,
    )
    assert.equal(raced, true)
    assert.equal(await readFile(output.targetPath, "utf8"), "theirs")
    await assertOnlyTargets(root, ["judgement.png"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rolls back promoted files and restores backups when a later file promotion fails", async () => {
  const root = await makeRoot()
  const first = fileTarget(root, "first.lua", "replace-existing", async (stagingFile) => {
    await writeFile(stagingFile, "new first")
  })
  const second = fileTarget(root, "second.lua", "replace-existing", async (stagingFile) => {
    await writeFile(stagingFile, "new second")
  })
  const promotionFailure = new Error("second file promotion failed")
  const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
    rename: async (source, destination) => {
      if (path.basename(source) === "payload" && destination === second.targetPath) {
        throw promotionFailure
      }
      await rename(source, destination)
    },
  }
  try {
    await writeFile(first.targetPath, "old first")
    await writeFile(second.targetPath, "old second")

    await assert.rejects(
      () => new TransactionalOutputSetPublisher(fileSystem).publish([first, second]),
      (error) => error instanceof Error && error.cause === promotionFailure,
    )
    assert.equal(await readFile(first.targetPath, "utf8"), "old first")
    assert.equal(await readFile(second.targetPath, "utf8"), "old second")
    await assertOnlyTargets(root, ["first.lua", "second.lua"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("publishes a replace-existing file when its missing expectation still holds", async () => {
  const root = await makeRoot()
  const output = fileTarget(
    root,
    "assetsConfig.lua",
    "replace-existing",
    async (stagingFile) => writeFile(stagingFile, "return {}"),
    { state: "missing" },
  )
  try {
    await new TransactionalOutputSetPublisher().publish([output])
    assert.equal(await readFile(output.targetPath, "utf8"), "return {}")
    await assertOnlyTargets(root, ["assetsConfig.lua"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
