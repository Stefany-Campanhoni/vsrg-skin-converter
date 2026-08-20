import assert from "node:assert/strict"
import test from "node:test"
import { renameWithTransientRetry } from "../../.ci/release/rename-with-transient-retry.ts"

function fileSystemError(code: string, message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException
  error.code = code
  return error
}

test("retries only transient Windows rename errors with bounded ordered backoff", async () => {
  const events: string[] = []
  let attempts = 0

  await renameWithTransientRetry(
    "source",
    "destination",
    async () => {
      attempts += 1
      events.push(`rename:${attempts}`)
      if (attempts <= 4) throw fileSystemError(attempts % 2 === 0 ? "EBUSY" : "EPERM", "locked")
    },
    async (milliseconds) => {
      events.push(`delay:${milliseconds}`)
    },
  )

  assert.deepEqual(events, [
    "rename:1",
    "delay:50",
    "rename:2",
    "delay:100",
    "rename:3",
    "delay:200",
    "rename:4",
    "delay:400",
    "rename:5",
  ])
})

test("preserves the final transient cause after the retry budget", async () => {
  const causes = Array.from({ length: 5 }, (_, index) =>
    fileSystemError("EBUSY", `locked:${index + 1}`),
  )
  const delays: number[] = []
  let attempts = 0

  await assert.rejects(
    renameWithTransientRetry(
      "source",
      "destination",
      async () => {
        throw causes[attempts++]
      },
      async (milliseconds) => {
        delays.push(milliseconds)
      },
    ),
    (error: unknown) => error === causes[4],
  )

  assert.equal(attempts, 5)
  assert.deepEqual(delays, [50, 100, 200, 400])
})

test("does not retry non-transient rename errors", async () => {
  const cause = fileSystemError("EACCES", "permission denied")
  let attempts = 0
  const delays: number[] = []

  await assert.rejects(
    renameWithTransientRetry(
      "source",
      "destination",
      async () => {
        attempts += 1
        throw cause
      },
      async (milliseconds) => {
        delays.push(milliseconds)
      },
    ),
    (error: unknown) => error === cause,
  )

  assert.equal(attempts, 1)
  assert.deepEqual(delays, [])
})
