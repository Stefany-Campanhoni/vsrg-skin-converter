import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { writeOsuLongNotes } from "./write-osu-long-notes.ts"

test("copies fixed long-note assets byte-for-byte to the osu template paths", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-lns-"))
  const body = new Uint8Array([1, 2, 3, 4])
  const tail = new Uint8Array([5, 6, 7])
  try {
    await writeFile(path.join(workspace, "LNB.png"), body)
    await writeFile(path.join(workspace, "LNT.png"), tail)

    await writeOsuLongNotes({ outputDirectory: workspace })

    expect([...(await readFile(path.join(workspace, "mania", "lns", "body.png")))]).toStrictEqual([
      ...body,
    ])
    expect([...(await readFile(path.join(workspace, "mania", "lns", "tail.png")))]).toStrictEqual([
      ...tail,
    ])
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test("rejects when a required long-note template asset is missing", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-lns-"))
  const body = new Uint8Array([23, 24, 25])
  try {
    await writeFile(path.join(workspace, "LNB.png"), body)

    await expect((() => writeOsuLongNotes({ outputDirectory: workspace }))()).rejects.toMatchObject(
      {
        code: "ENOENT",
      },
    )
    expect([...(await readFile(path.join(workspace, "mania", "lns", "body.png")))]).toStrictEqual([
      ...body,
    ])
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
