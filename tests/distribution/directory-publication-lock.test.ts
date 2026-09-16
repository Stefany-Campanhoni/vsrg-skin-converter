import { expect, test } from "bun:test"
import { acquireDirectoryPublicationLock } from "../../.ci/release/directory-publication-lock.ts"

function filesystemError(code: string): Error {
  const error = new Error(code) as NodeJS.ErrnoException
  error.code = code
  return error
}

test("retries when a lock disappears before it can be inspected", async () => {
  let createAttempts = 0
  const removed: string[] = []
  const release = await acquireDirectoryPublicationLock({
    lockPath: "runtime.lock",
    staleLockPath: "runtime.lock.stale-test",
    pollIntervalMs: 1,
    timeoutMs: 10,
    staleAfterMs: 5,
    dependencies: {
      createDirectory: async () => {
        createAttempts += 1
        if (createAttempts === 1) throw filesystemError("EEXIST")
      },
      inspectPath: async () => {
        throw filesystemError("ENOENT")
      },
      renamePath: async () => {
        throw new Error("a disappeared lock must not be renamed")
      },
      removePath: async (target) => {
        removed.push(target)
      },
      delay: async () => {},
      now: () => 0,
    },
  })

  expect(createAttempts).toBe(2)
  await release()
  expect(removed).toStrictEqual(["runtime.lock"])
})

test("never removes the active lock when another waiter retires the stale lock first", async () => {
  let createAttempts = 0
  const removed: string[] = []
  const renamed: Array<readonly [string, string]> = []
  const release = await acquireDirectoryPublicationLock({
    lockPath: "runtime.lock",
    staleLockPath: "runtime.lock.stale-test",
    pollIntervalMs: 1,
    timeoutMs: 10,
    staleAfterMs: 5,
    dependencies: {
      createDirectory: async () => {
        createAttempts += 1
        if (createAttempts === 1) throw filesystemError("EEXIST")
      },
      inspectPath: async () => ({
        isDirectory: () => true,
        isSymbolicLink: () => false,
        mtimeMs: 0,
      }),
      renamePath: async (source, destination) => {
        renamed.push([source, destination])
        throw filesystemError("ENOENT")
      },
      removePath: async (target) => {
        removed.push(target)
      },
      delay: async () => {},
      now: () => 10,
    },
  })

  expect(createAttempts).toBe(2)
  expect(renamed).toStrictEqual([["runtime.lock", "runtime.lock.stale-test"]])
  await release()
  expect(removed).toStrictEqual(["runtime.lock"])
})
