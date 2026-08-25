import assert from "node:assert/strict"
import test from "node:test"
import { type CliCommandDependencies, runCliCommand } from "./run-cli-command.ts"

function commandFixture() {
  const events: string[] = []
  const dependencies: CliCommandDependencies = {
    version: "1.0.0",
    writeLine: (value) => events.push(`write:${value}`),
    runInteractiveCli: async () => {
      events.push("interactive")
    },
  }
  return { events, dependencies }
}

test("runs the interactive CLI when no arguments are supplied", async () => {
  const { events, dependencies } = commandFixture()
  await runCliCommand([], dependencies)
  assert.deepEqual(events, ["interactive"])
})

test("prints version without starting prompts", async () => {
  const { events, dependencies } = commandFixture()
  await runCliCommand(["--version"], dependencies)
  assert.deepEqual(events, ["write:1.0.0"])
})

test("prints concise help without starting prompts", async () => {
  const { events, dependencies } = commandFixture()
  await runCliCommand(["--help"], dependencies)
  assert.deepEqual(events, [
    "write:VSRG Skin Converter 1.0.0",
    "write:Usage: vsrg-skin-converter.cmd [--verbose] [--help|--version]",
  ])
})

test("rejects unknown or combined arguments", async () => {
  const { dependencies } = commandFixture()
  await assert.rejects(() => runCliCommand(["--unknown"], dependencies), /unknown argument/i)
  await assert.rejects(() => runCliCommand(["--help", "extra"], dependencies), /arguments/i)
})
