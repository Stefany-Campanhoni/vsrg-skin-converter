import { expect, test } from "bun:test"
import { createOsuSourceFixture } from "../../tests/support/migration-source-fixtures.ts"
import { columnDirections } from "../domain/image.ts"
import { isWorkerReply } from "./worker-messages.ts"

test("preview messages require four ordered lanes with bounded note and receptor bytes", async () => {
  const files = await createOsuSourceFixture()
  const image = [...files].find(([name]) => name.endsWith(".png"))?.[1]
  if (!image) throw new Error("Missing PNG fixture")
  const artwork = columnDirections.map((direction) => ({ direction, note: image, receptor: image }))
  const preview = {
    artwork,
    playfield: {
      hitPosition: 450,
      judgementPosition: 300,
      comboPosition: 200,
      columnWidth: 64,
      comboScale: 1,
      judgementScale: 1,
    },
    diagnostics: [],
  }
  const reply = (artwork: unknown) => ({
    kind: "preview",
    requestId: 1,
    preview: { ...preview, artwork },
  })
  expect(isWorkerReply(reply(artwork))).toBe(true)
  for (const invalid of [
    undefined,
    [],
    artwork.slice(0, 3),
    [...artwork].reverse(),
    artwork.map((lane) => ({ ...lane, note: [] })),
    artwork.map((lane) => ({ ...lane, receptor: new Uint8Array() })),
    artwork.map((lane) => ({ ...lane, note: new Uint8Array(1024 * 1024 + 1) })),
  ])
    expect(isWorkerReply(reply(invalid))).toBe(false)
})

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
