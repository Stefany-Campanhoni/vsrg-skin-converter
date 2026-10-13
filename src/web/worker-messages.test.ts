import { expect, test } from "bun:test"
import { isWorkerReply } from "./worker-messages.ts"

test("worker catalogs require complete typed skin, profile, theme and diagnostic fields", () => {
  const discovery = {
    skins: [{ name: "Foo", path: "NoteSkins/dance/Foo" }],
    profileIds: ["00000000"],
    theme: "Rebirth",
    diagnostics: [],
  }
  expect(isWorkerReply({ kind: "discovery", requestId: 1, discovery })).toBe(true)
  for (const invalid of [
    undefined,
    {},
    { ...discovery, skins: [{}] },
    { ...discovery, profileIds: [0] },
    { ...discovery, theme: null },
    { ...discovery, diagnostics: [null] },
  ])
    expect(isWorkerReply({ kind: "discovery", requestId: 1, discovery: invalid })).toBe(false)
})

test("worker transport validates complete payloads before controllers receive them", () => {
  for (const value of [
    null,
    { kind: "success", requestId: 1 },
    { kind: "preview", requestId: 1, preview: {} },
    {
      kind: "progress",
      requestId: 1,
      progress: { phase: "rendering", completed: "bad", total: 1 },
    },
    { kind: "failure", requestId: 1, message: 42 },
  ])
    expect(isWorkerReply(value)).toBe(false)
  expect(isWorkerReply({ kind: "ready", requestId: 0 })).toBe(true)
  expect(
    isWorkerReply({
      kind: "success",
      requestId: 1,
      result: { archive: new Uint8Array(), filename: "result.zip", diagnostics: [] },
    }),
  ).toBe(true)
})
