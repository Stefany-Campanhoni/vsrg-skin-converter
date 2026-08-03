import assert from "node:assert/strict"
import test from "node:test"
import type { SkinModel, SkinReference } from "../../domain/skin.ts"
import type { OutputPublisher } from "../ports/output-publisher.ts"
import type { SkinReader } from "../ports/skin-reader.ts"
import type { SkinWriter } from "../ports/skin-writer.ts"
import { ConversionRegistry, type SkinConversion } from "./conversion-registry.ts"
import { convertSkin } from "./convert-skin.ts"

const reference: SkinReference = {
  game: "etterna",
  name: "Fixture",
  sourcePath: "skin",
  gameRoot: "game",
}
const sourceSkin: SkinModel = {
  game: "etterna",
  metadata: { name: "Fixture" },
  playfield: {
    hitPosition: -6,
    judgementPosition: 0,
    comboPosition: 0,
    columnWidth: 100,
    comboScale: 1,
    judgementScale: 1,
  },
  assets: {},
  diagnostics: [],
}

test("orchestrates read, conversion, staged writing, and publication", async () => {
  const calls: string[] = []
  const reader: SkinReader = {
    game: "etterna",
    readSkin: async () => {
      calls.push("read")
      return sourceSkin
    },
  }
  const conversion: SkinConversion = {
    source: "etterna",
    target: "osu",
    convert: async (skin) => {
      calls.push("convert")
      return {
        ...skin,
        game: "osu",
        diagnostics: [
          {
            code: "fixture.warning",
            severity: "warning",
            component: "fixture",
            message: "warning",
          },
        ],
      }
    },
  }
  const writer: SkinWriter = {
    game: "osu",
    writeSkin: async (skin, workspace) => {
      calls.push(`write:${skin.game}:${workspace}`)
    },
  }
  const publisher: OutputPublisher = {
    publish: async (target, build) => {
      calls.push(`publish:${target}`)
      await build("staging")
    },
  }
  const result = await convertSkin(
    {
      reference,
      targetGame: "osu",
      outputDirectory: "output",
    },
    {
      readers: new Map([["etterna", reader]]),
      writers: new Map([["osu", writer]]),
      conversions: new ConversionRegistry([conversion]),
      publisher,
    },
  )

  assert.deepEqual(calls, ["read", "convert", "publish:output", "write:osu:staging"])
  assert.equal(result.diagnostics[0]?.code, "fixture.warning")
})

test("does not publish when source reading fails", async () => {
  let published = false
  const reader: SkinReader = {
    game: "etterna",
    readSkin: async () => {
      throw new Error("read failed")
    },
  }
  const publisher: OutputPublisher = {
    publish: async () => {
      published = true
    },
  }
  const conversion: SkinConversion = {
    source: "etterna",
    target: "osu",
    convert: async (skin) => ({ ...skin, game: "osu" }),
  }
  const writer: SkinWriter = {
    game: "osu",
    writeSkin: async () => {},
  }

  await assert.rejects(
    () =>
      convertSkin(
        {
          reference,
          targetGame: "osu",
          outputDirectory: "output",
        },
        {
          readers: new Map([["etterna", reader]]),
          writers: new Map([["osu", writer]]),
          conversions: new ConversionRegistry([conversion]),
          publisher,
        },
      ),
    /read failed/i,
  )
  assert.equal(published, false)
})
