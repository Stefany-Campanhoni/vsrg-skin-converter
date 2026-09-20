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

test("fails closed instead of stealing a stale publication lock", async () => {
  const removed: string[] = []
  await expect(
    acquireDirectoryPublicationLock({
      lockPath: "runtime.lock",
      pollIntervalMs: 1,
      timeoutMs: 10,
      staleAfterMs: 5,
      dependencies: {
        createDirectory: async () => {
          throw filesystemError("EEXIST")
        },
        inspectPath: async () => ({
          isDirectory: () => true,
          isSymbolicLink: () => false,
          mtimeMs: 0,
        }),
        removePath: async (target) => {
          removed.push(target)
        },
        delay: async () => {},
        now: () => 10,
      },
    }),
  ).rejects.toThrow(
    "Stale publication lock requires manual cleanup after confirming no publisher is active: runtime.lock",
  )

  expect(removed).toBeEmpty()
})
