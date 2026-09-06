import { expect, test } from "bun:test"
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
  expect(events).toStrictEqual(["interactive"])
})

test("prints version without starting prompts", async () => {
  const { events, dependencies } = commandFixture()
  await runCliCommand(["--version"], dependencies)
  expect(events).toStrictEqual(["write:1.0.0"])
})

test("prints concise help without starting prompts", async () => {
  const { events, dependencies } = commandFixture()
  await runCliCommand(["--help"], dependencies)
  expect(events).toStrictEqual([
    "write:VSRG Skin Converter 1.0.0",
    "write:Usage: vsrg-skin-converter.cmd [--verbose] [--help|--version]",
  ])
})

test("rejects unknown or combined arguments", async () => {
  const { dependencies } = commandFixture()
  await expect((() => runCliCommand(["--unknown"], dependencies))()).rejects.toThrow(
    /unknown argument/i,
  )
  await expect((() => runCliCommand(["--help", "extra"], dependencies))()).rejects.toThrow(
    /arguments/i,
  )
})
