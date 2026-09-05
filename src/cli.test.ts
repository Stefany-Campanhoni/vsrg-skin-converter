import { test } from "bun:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

test("prints the complete error stack when started through the dev script", async () => {
  const cliPath = fileURLToPath(new URL("cli.ts", import.meta.url))
  const result = await runCli([cliPath, "--unknown"], {
    ...process.env,
    npm_lifecycle_event: "dev",
  })

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /error: Unknown argument: --unknown[\s\S]+\s+at /i)
})

test("prints the complete error stack when started with --verbose", async () => {
  const cliPath = fileURLToPath(new URL("cli.ts", import.meta.url))
  const result = await runCli([cliPath, "--verbose", "--unknown"], {
    ...process.env,
    npm_lifecycle_event: "start",
  })

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /error: Unknown argument: --unknown[\s\S]+\s+at /i)
})

test("prints the complete error stack when --verbose is repeated", async () => {
  const cliPath = fileURLToPath(new URL("cli.ts", import.meta.url))
  const result = await runCli([cliPath, "--verbose", "--verbose", "--unknown"], {
    ...process.env,
    npm_lifecycle_event: "start",
  })

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /error: Unknown argument: --unknown[\s\S]+\s+at /i)
})

test("keeps error output concise outside the dev script", async () => {
  const cliPath = fileURLToPath(new URL("cli.ts", import.meta.url))
  const result = await runCli([cliPath, "--unknown"], {
    ...process.env,
    npm_lifecycle_event: "start",
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.stderr, "Unknown argument: --unknown\n")
})

interface ProcessResult {
  readonly exitCode: number | null
  readonly stderr: string
}

async function runCli(args: readonly string[], env: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""

    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })
    child.once("error", reject)
    child.once("close", (exitCode) => resolve({ exitCode, stderr }))
  })
}
