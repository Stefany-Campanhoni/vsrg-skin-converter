import { expect, test } from "bun:test"

test("prints the complete error stack when started through the dev script", async () => {
  const cliPath = Bun.fileURLToPath(new URL("cli.ts", import.meta.url))
  const result = await runCli([cliPath, "--unknown"], {
    ...Bun.env,
    npm_lifecycle_event: "dev",
  })

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toMatch(/error: Unknown argument: --unknown[\s\S]+\s+at /i)
})

test("prints the complete error stack when started with --verbose", async () => {
  const cliPath = Bun.fileURLToPath(new URL("cli.ts", import.meta.url))
  const result = await runCli([cliPath, "--verbose", "--unknown"], {
    ...Bun.env,
    npm_lifecycle_event: "start",
  })

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toMatch(/error: Unknown argument: --unknown[\s\S]+\s+at /i)
})

test("prints the complete error stack when --verbose is repeated", async () => {
  const cliPath = Bun.fileURLToPath(new URL("cli.ts", import.meta.url))
  const result = await runCli([cliPath, "--verbose", "--verbose", "--unknown"], {
    ...Bun.env,
    npm_lifecycle_event: "start",
  })

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toMatch(/error: Unknown argument: --unknown[\s\S]+\s+at /i)
})

test("keeps error output concise outside the dev script", async () => {
  const cliPath = Bun.fileURLToPath(new URL("cli.ts", import.meta.url))
  const result = await runCli([cliPath, "--unknown"], {
    ...Bun.env,
    npm_lifecycle_event: "start",
  })

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toBe("Unknown argument: --unknown\n")
})

interface ProcessResult {
  readonly exitCode: number
  readonly stderr: string
}

async function runCli(
  args: readonly string[],
  env: Record<string, string | undefined>,
): Promise<ProcessResult> {
  const executable = Bun.argv[0]
  if (!executable) throw new Error("Could not determine the Bun executable")
  const subprocess = Bun.spawn({
    cmd: [executable, ...args],
    env,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  })
  const [exitCode, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stderr).text(),
  ])
  return { exitCode, stderr }
}
