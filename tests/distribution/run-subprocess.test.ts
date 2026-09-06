import { expect, test } from "bun:test"
import { runCapturedSubprocess, runInheritedSubprocess } from "../../.ci/runtime/run-subprocess.ts"

test("captures subprocess output, exit status, and arguments containing spaces", async () => {
  const executable = requireBunExecutable()
  const result = await runCapturedSubprocess([
    executable,
    "-e",
    "console.log(Bun.argv.at(-1)); console.error('failure detail'); process.exitCode = 7",
    "value with spaces",
  ])

  expect(result).toEqual({
    stdout: "value with spaces\n",
    stderr: "failure detail\n",
    code: 7,
    signal: null,
    timedOut: false,
  })
})

test("marks and terminates a subprocess after its timeout", async () => {
  const executable = requireBunExecutable()
  const result = await runCapturedSubprocess([executable, "-e", "await Bun.sleep(10_000)"], {
    timeoutMs: 50,
  })

  expect(result.timedOut).toBe(true)
  expect(result.code === null || result.code !== 0).toBe(true)
})

test("does not time out after the subprocess exits while captured output is still decoding", async () => {
  let exitCode: number | null = null
  let killed = false
  const exited = Promise.resolve().then(() => {
    exitCode = 0
    return exitCode
  })
  const delayedOutput = new ReadableStream<Uint8Array>({
    start(controller) {
      setTimeout(() => {
        controller.enqueue(new TextEncoder().encode("captured after exit"))
        controller.close()
      }, 50)
    },
  })
  const result = await runCapturedSubprocess(
    ["fake-command"],
    { timeoutMs: 10 },
    {
      spawn: () => ({
        stdout: delayedOutput,
        stderr: new ReadableStream({ start: (controller) => controller.close() }),
        exited,
        get exitCode() {
          return exitCode
        },
        signalCode: null,
        kill: () => {
          killed = true
        },
      }),
    },
  )

  expect(result.code).toBe(0)
  expect(result.signal).toBeNull()
  expect(result.stdout).toBe("captured after exit")
  expect(result.timedOut).toBe(false)
  expect(killed).toBe(false)
})

test("reports inherited subprocess failures without changing their status", async () => {
  const executable = requireBunExecutable()
  const result = await runInheritedSubprocess([executable, "-e", "process.exitCode = 9"])

  expect(result.code).toBe(9)
  expect(result.signal).toBeNull()
})

function requireBunExecutable(): string {
  const executable = Bun.argv[0]
  if (!executable) throw new Error("Could not determine the Bun executable")
  return executable
}
