import assert from "node:assert/strict"
import test from "node:test"
import type { EtternaProfile } from "../adapters/etterna/profile/etterna-profile-catalog.ts"
import { selectEtternaProfile } from "./main.ts"

test("selects the only Etterna profile without prompting", async () => {
  let prompted = false
  const selected = await selectEtternaProfile(
    [{ id: "00000000", displayName: "Only profile" }],
    async () => {
      prompted = true
      return undefined
    },
  )

  assert.equal(selected, "00000000")
  assert.equal(prompted, false)
})

test("prompts for an Etterna profile using display names as labels", async () => {
  const profiles: EtternaProfile[] = [
    { id: "00000000", displayName: "Alice" },
    { id: "00000001", displayName: "unknown" },
  ]
  let receivedMessage: string | undefined
  let receivedOptions: { value: string; label: string }[] | undefined

  const selected = await selectEtternaProfile(profiles, async (message, options) => {
    receivedMessage = message
    receivedOptions = options
    return "00000001"
  })

  assert.equal(selected, "00000001")
  assert.equal(receivedMessage, "Select the Etterna profile:")
  assert.deepEqual(receivedOptions, [
    { value: "00000000", label: "Alice" },
    { value: "00000001", label: "unknown" },
  ])
})

test("rejects a profile selection that is not in the discovered catalog", async () => {
  await assert.rejects(
    () =>
      selectEtternaProfile(
        [
          { id: "00000000", displayName: "First valid profile" },
          { id: "00000001", displayName: "Second valid profile" },
        ],
        async () => "../outside",
      ),
    /selected Etterna profile is not available/i,
  )
})
