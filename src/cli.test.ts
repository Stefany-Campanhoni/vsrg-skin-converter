import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("prints the complete error stack when started through the dev script", async () => {
  const cliPath = fileURLToPath(new URL("cli.ts", import.meta.url))
  const result = await runCli([cliPath, "--unknown"], {
    ...process.env,
    npm_lifecycle_event: "dev",
  })

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /Error: Unknown argument: --unknown[\s\S]+\s+at /)
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
