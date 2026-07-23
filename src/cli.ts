import { runCli } from "./cli/main.ts"

runCli().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
