import { test } from "bun:test"
import assert from "node:assert/strict"
import { type CliDependencies, runCli } from "./main.ts"

test("offers both source games and dispatches the Etterna source route", async () => {
  const events: string[] = []
  await runCli(createDependencies("etterna", events))
  assert.deepEqual(events, ["select:Select the source game::etterna,osu", "route:etterna"])
})

test("dispatches the osu source route without exposing a target-game picker", async () => {
  const events: string[] = []
  await runCli(createDependencies("osu", events))
  assert.deepEqual(events, ["select:Select the source game::etterna,osu", "route:osu"])
})

test("does not dispatch a conversion route when source-game selection is cancelled", async () => {
  const events: string[] = []
  await runCli(createDependencies(undefined, events))
  assert.deepEqual(events, ["select:Select the source game::etterna,osu"])
})

function createDependencies(source: string | undefined, events: string[]): CliDependencies {
  return {
    askSelect: async (message, options) => {
      events.push(`select:${message}:${options.map((option) => option.value).join(",")}`)
      return source
    },
    runEtternaToOsuRoute: async () => {
      events.push("route:etterna")
    },
    runOsuToEtternaRoute: async () => {
      events.push("route:osu")
    },
  }
}
