import assert from "node:assert/strict"
import test from "node:test"
import type { SkinModel, SkinReference } from "../../domain/skin.ts"
import type { SkinInstaller } from "../ports/skin-installer.ts"
import type { SkinReader } from "../ports/skin-reader.ts"
import { ConversionRegistry, type SkinConversion } from "./conversion-registry.ts"
import { convertAndInstallSkin } from "./convert-and-install-skin.ts"

const reference: SkinReference = {
  game: "osu",
  name: "Catalog Fixture",
  sourcePath: "source-skin",
  gameRoot: "source-game",
}

const sourceSkin: SkinModel = {
  game: "osu",
  metadata: { name: "Parsed Fixture" },
  playfield: {
    hitPosition: 440,
    judgementPosition: 240,
    comboPosition: 229,
    columnWidth: 70,
    comboScale: 1,
    judgementScale: 1,
  },
  assets: {},
  diagnostics: [],
}

const convertedDiagnostics: SkinModel["diagnostics"] = [
  {
    code: "fixture.first",
    severity: "info",
    component: "fixture",
    message: "first",
  },
  {
    code: "fixture.second",
    severity: "warning",
    component: "fixture",
    message: "second",
  },
]

test("reads, converts, and installs once in order and returns ordered diagnostics", async () => {
  const calls: string[] = []
  const convertedSkin: SkinModel = {
    ...sourceSkin,
    game: "etterna",
    diagnostics: convertedDiagnostics,
  }
  const reader: SkinReader = {
    game: "osu",
    readSkin: async (actualReference) => {
      calls.push("read")
      assert.equal(actualReference, reference)
      return sourceSkin
    },
  }
  const conversion: SkinConversion = {
    source: "osu",
    target: "etterna",
    convert: async (skin) => {
      calls.push("convert")
      assert.equal(skin, sourceSkin)
      return convertedSkin
    },
  }
  const installer: SkinInstaller = {
    game: "etterna",
    installSkin: async (skin) => {
      calls.push("install")
      assert.equal(skin, convertedSkin)
    },
  }

  const result = await convertAndInstallSkin(
    { reference, targetGame: "etterna" },
    {
      readers: new Map([["osu", reader]]),
      installers: new Map([["etterna", installer]]),
      conversions: new ConversionRegistry([conversion]),
    },
  )

  assert.deepEqual(calls, ["read", "convert", "install"])
  assert.deepEqual(result.diagnostics, convertedDiagnostics)
})

test("reports a missing source reader", async () => {
  await assert.rejects(
    () =>
      convertAndInstallSkin(
        { reference, targetGame: "etterna" },
        {
          readers: new Map(),
          installers: new Map(),
          conversions: new ConversionRegistry([]),
        },
      ),
    /No skin reader.*osu/i,
  )
})

test("reports a missing target installer before reading", async () => {
  let readStarted = false
  const reader: SkinReader = {
    game: "osu",
    readSkin: async () => {
      readStarted = true
      return sourceSkin
    },
  }

  await assert.rejects(
    () =>
      convertAndInstallSkin(
        { reference, targetGame: "etterna" },
        {
          readers: new Map([["osu", reader]]),
          installers: new Map(),
          conversions: new ConversionRegistry([]),
        },
      ),
    /No skin installer.*etterna/i,
  )
  assert.equal(readStarted, false)
})

test("does not convert or install after source reading fails", async () => {
  const calls: string[] = []
  const reader: SkinReader = {
    game: "osu",
    readSkin: async () => {
      calls.push("read")
      throw new Error("read failed")
    },
  }
  const conversion: SkinConversion = {
    source: "osu",
    target: "etterna",
    convert: async () => {
      calls.push("convert")
      return { ...sourceSkin, game: "etterna" }
    },
  }
  const installer: SkinInstaller = {
    game: "etterna",
    installSkin: async () => {
      calls.push("install")
    },
  }

  await assert.rejects(
    () =>
      convertAndInstallSkin(
        { reference, targetGame: "etterna" },
        {
          readers: new Map([["osu", reader]]),
          installers: new Map([["etterna", installer]]),
          conversions: new ConversionRegistry([conversion]),
        },
      ),
    /read failed/i,
  )
  assert.deepEqual(calls, ["read"])
})

test("does not install after conversion fails", async () => {
  const calls: string[] = []
  const reader: SkinReader = {
    game: "osu",
    readSkin: async () => {
      calls.push("read")
      return sourceSkin
    },
  }
  const conversion: SkinConversion = {
    source: "osu",
    target: "etterna",
    convert: async () => {
      calls.push("convert")
      throw new Error("conversion failed")
    },
  }
  const installer: SkinInstaller = {
    game: "etterna",
    installSkin: async () => {
      calls.push("install")
    },
  }

  await assert.rejects(
    () =>
      convertAndInstallSkin(
        { reference, targetGame: "etterna" },
        {
          readers: new Map([["osu", reader]]),
          installers: new Map([["etterna", installer]]),
          conversions: new ConversionRegistry([conversion]),
        },
      ),
    /conversion failed/i,
  )
  assert.deepEqual(calls, ["read", "convert"])
})
