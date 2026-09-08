import { expect, test } from "bun:test"
import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { expectRejectionSatisfies, expectTruthy } from "../../../../tests/support/expectations.ts"
import type {
  OutputSetPublisher,
  OutputSetTarget,
} from "../../../application/ports/output-set-publisher.ts"
import { createDefaultEtternaInstaller } from "../../../cli/routes/run-osu-to-etterna.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import type { PreparedEtternaAssetsConfigUpdate } from "../assets/prepare-etterna-assets-config-update.ts"
import {
  EtternaSkinInstaller,
  type EtternaSkinInstallerDependencies,
} from "./etterna-skin-installer.ts"

const gameRoot = path.resolve("Etterna")

const etternaSkin: SkinModel = {
  game: "etterna",
  metadata: { name: "Converted Skin (osu!)" },
  playfield: {
    hitPosition: 1,
    judgementPosition: 2,
    comboPosition: 3,
    columnWidth: 108,
    comboScale: 1,
    judgementScale: 1,
    scrollSpeed: 1,
  },
  assets: {
    judgements: {
      sourceDensity: 2,
      images: {
        marvelous: { filePath: "marvelous.png", rotation: 0 },
        perfect: { filePath: "perfect.png", rotation: 0 },
        great: { filePath: "great.png", rotation: 0 },
        good: { filePath: "good.png", rotation: 0 },
        bad: { filePath: "bad.png", rotation: 0 },
        miss: { filePath: "miss.png", rotation: 0 },
      },
    },
  },
  diagnostics: [],
}

test("prepares and publishes NoteSkin, profile, judgement, and assets config as one exact output set", async () => {
  const calls: string[] = []
  let publishedTargets: readonly OutputSetTarget[] | undefined
  const preparedUpdate: PreparedEtternaAssetsConfigUpdate = {
    content: "prepared config",
    expectation: { state: "sha256", sha256: "a".repeat(64) },
  }
  const dependencies: EtternaSkinInstallerDependencies = {
    allocateProfileIdentity: async (actualGameRoot) => {
      calls.push("allocate")
      expect(actualGameRoot).toBe(gameRoot)
      return { id: "00000004", guid: "0123456789abcdef" }
    },
    noteSkinWriter: {
      writeSkin: async (skin, workspace) => {
        calls.push("write NoteSkin")
        expect(skin).toBe(etternaSkin)
        expect(workspace).toBe("noteskin-staging")
      },
    },
    profileWriter: {
      writeProfile: async (skin, workspace, configuration) => {
        calls.push("write profile")
        expect(skin).toBe(etternaSkin)
        expect(workspace).toBe("profile-staging")
        expect(configuration).toStrictEqual({
          profileName: "CFG Username",
          guid: "0123456789abcdef",
          theme: "Rebirth",
        })
      },
    },
    judgementWriter: {
      writeJudgement: async (skin, stagingFile) => {
        calls.push("write judgement")
        expect(skin).toBe(etternaSkin)
        expect(stagingFile).toBe("judgement-staging")
      },
    },
    assetsConfigWriter: {
      prepareUpdate: async (filePath, guid, relativeJudgementPath) => {
        calls.push("prepare config")
        expect(filePath).toBe(path.join(gameRoot, "Save", "Rebirth_settings", "assetsConfig.lua"))
        expect(guid).toBe("0123456789abcdef")
        expect(relativeJudgementPath).toBe(
          "Assets/Judgments/Converted Skin (osu!) - 0123456789abcdef 1x6 (Doubleres).png",
        )
        return preparedUpdate
      },
      writeUpdate: async (stagingFile, update) => {
        calls.push("write config")
        expect(stagingFile).toBe("config-staging")
        expect(update).toBe(preparedUpdate)
      },
    },
    publisher: {
      publish: async (targets) => {
        calls.push("publish")
        publishedTargets = targets
        expect(targets.length).toBe(4)
        await targets[0]?.build("noteskin-staging")
        await targets[1]?.build("profile-staging")
        await targets[2]?.build("judgement-staging")
        await targets[3]?.build("config-staging")
      },
    },
  }

  await new EtternaSkinInstaller(
    {
      gameRoot,
      profileName: "CFG Username",
      theme: "Rebirth",
      expectedNoteSkinName: etternaSkin.metadata.name,
      overwriteExistingNoteSkin: false,
    },
    dependencies,
  ).installSkin(etternaSkin)

  expect(calls).toStrictEqual([
    "allocate",
    "prepare config",
    "publish",
    "write NoteSkin",
    "write profile",
    "write judgement",
    "write config",
  ])
  expectTruthy(publishedTargets)
  expect(
    publishedTargets.map((target) => ({
      kind: target.kind,
      targetPath: target.targetPath,
      allowedRoot: target.allowedRoot,
      policy: target.policy,
      expectedContent: target.kind === "file" ? target.expectedContent : undefined,
    })),
  ).toStrictEqual([
    {
      kind: "directory",
      targetPath: path.join(gameRoot, "NoteSkins", "dance", "Converted Skin (osu!)"),
      allowedRoot: path.join(gameRoot, "NoteSkins", "dance"),
      policy: "must-not-exist",
      expectedContent: undefined,
    },
    {
      kind: "directory",
      targetPath: path.join(gameRoot, "Save", "LocalProfiles", "00000004"),
      allowedRoot: path.join(gameRoot, "Save", "LocalProfiles"),
      policy: "must-not-exist",
      expectedContent: undefined,
    },
    {
      kind: "file",
      targetPath: path.join(
        gameRoot,
        "Assets",
        "Judgments",
        "Converted Skin (osu!) - 0123456789abcdef 1x6 (Doubleres).png",
      ),
      allowedRoot: path.join(gameRoot, "Assets", "Judgments"),
      policy: "must-not-exist",
      expectedContent: undefined,
    },
    {
      kind: "file",
      targetPath: path.join(gameRoot, "Save", "Rebirth_settings", "assetsConfig.lua"),
      allowedRoot: path.join(gameRoot, "Save", "Rebirth_settings"),
      policy: "replace-existing",
      expectedContent: preparedUpdate.expectation,
    },
  ])
})

test("authorizes replacement only for the expected NoteSkin target", async () => {
  let policies: readonly OutputSetTarget["policy"][] = []
  const publisher: OutputSetPublisher = {
    publish: async (targets) => {
      policies = targets.map((target) => target.policy)
    },
  }

  await new EtternaSkinInstaller(
    {
      gameRoot,
      profileName: "CFG Username",
      theme: "Rebirth",
      expectedNoteSkinName: etternaSkin.metadata.name,
      overwriteExistingNoteSkin: true,
    },
    dependenciesWith(publisher),
  ).installSkin(etternaSkin)

  expect(policies).toStrictEqual([
    "replace-existing",
    "must-not-exist",
    "must-not-exist",
    "replace-existing",
  ])
})

test("rejects a non-Etterna model before allocating an identity or publishing", async () => {
  let allocationStarted = false
  let publicationStarted = false
  const dependencies = dependenciesWith({
    publish: async () => {
      publicationStarted = true
    },
  })
  dependencies.allocateProfileIdentity = async () => {
    allocationStarted = true
    return { id: "00000004", guid: "0123456789abcdef" }
  }

  await expect(
    (() =>
      new EtternaSkinInstaller(
        {
          gameRoot,
          profileName: "CFG Username",
          theme: "Rebirth",
          expectedNoteSkinName: etternaSkin.metadata.name,
          overwriteExistingNoteSkin: false,
        },
        dependencies,
      ).installSkin({ ...etternaSkin, game: "osu" }))(),
  ).rejects.toThrow(/Etterna installer.*osu/i)

  expect(allocationStarted).toBe(false)
  expect(publicationStarted).toBe(false)
})

test("rejects an absent-target A to B skin mutation before side effects", async () => {
  let allocationStarted = false
  let publicationStarted = false
  let writerStarted = false
  const dependencies = dependenciesWith({
    publish: async () => {
      publicationStarted = true
    },
  })
  dependencies.allocateProfileIdentity = async () => {
    allocationStarted = true
    return { id: "00000004", guid: "0123456789abcdef" }
  }
  const guardedDependencies: EtternaSkinInstallerDependencies = {
    ...dependencies,
    noteSkinWriter: {
      writeSkin: async () => {
        writerStarted = true
      },
    },
  }

  await expect(
    (() =>
      new EtternaSkinInstaller(
        {
          gameRoot,
          profileName: "CFG Username",
          theme: "Rebirth",
          expectedNoteSkinName: "Selected NoteSkin A",
          overwriteExistingNoteSkin: false,
        },
        guardedDependencies,
      ).installSkin({ ...etternaSkin, metadata: { name: "Parsed skin.ini Name B" } }))(),
  ).rejects.toThrow(/does not match the expected NoteSkin name/i)

  expect(allocationStarted).toBe(false)
  expect(publicationStarted).toBe(false)
  expect(writerStarted).toBe(false)
})

test("rejects missing judgements before identity allocation or publication", async () => {
  let allocated = false
  let published = false
  const dependencies = dependenciesWith({
    publish: async () => {
      published = true
    },
  })
  dependencies.allocateProfileIdentity = async () => {
    allocated = true
    return { id: "00000004", guid: "0123456789abcdef" }
  }

  await expect(
    (() =>
      new EtternaSkinInstaller(
        {
          gameRoot,
          profileName: "CFG Username",
          theme: "Rebirth",
          expectedNoteSkinName: etternaSkin.metadata.name,
          overwriteExistingNoteSkin: false,
        },
        dependencies,
      ).installSkin({
        ...etternaSkin,
        assets: { ...etternaSkin.assets, judgements: undefined },
      }))(),
  ).rejects.toThrow(/does not contain judgements/i)
  expect(allocated).toBe(false)
  expect(published).toBe(false)
})

test("prepares assetsConfig before publication and propagates preparation failure", async () => {
  const failure = new Error("invalid assetsConfig")
  let published = false
  const dependencies = dependenciesWith({
    publish: async () => {
      published = true
    },
  })
  dependencies.assetsConfigWriter.prepareUpdate = async () => {
    throw failure
  }

  await expectRejectionSatisfies(
    (() =>
      new EtternaSkinInstaller(
        {
          gameRoot,
          profileName: "CFG Username",
          theme: "Rebirth",
          expectedNoteSkinName: etternaSkin.metadata.name,
          overwriteExistingNoteSkin: false,
        },
        dependencies,
      ).installSkin(etternaSkin))(),
    (error) => error === failure,
  )
  expect(published).toBe(false)
})

test("production composition uses the NoteSkin and profile template subdirectories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-etterna-install-"))
  const source = path.join(root, "source.png")
  const skin = completeEtternaSkin(source)
  try {
    await writeFile(
      source,
      await sharp({
        create: { width: 2, height: 2, channels: 4, background: "#ffffff" },
      })
        .png()
        .toBuffer(),
    )
    await createDefaultEtternaInstaller(
      {
        gameRoot: root,
        profileName: "CFG Username",
        theme: "Rebirth",
        expectedNoteSkinName: skin.metadata.name,
        overwriteExistingNoteSkin: false,
      },
      { allocateProfileIdentity: async () => ({ id: "00000004", guid: "0123456789abcdef" }) },
    ).installSkin(skin)

    const noteSkinDirectory = path.join(root, "NoteSkins", "dance", skin.metadata.name)
    await access(path.join(noteSkinDirectory, "NoteSkin.lua"))
    await access(path.join(noteSkinDirectory, "metrics.ini"))
    expectTruthy((await readdir(path.join(noteSkinDirectory, "Holds"))).length > 0)
    expectTruthy((await readdir(path.join(noteSkinDirectory, "Misc"))).length > 0)
    expect((await readdir(path.join(noteSkinDirectory, "Receptors"))).length).toBe(8)
    expect((await readdir(path.join(noteSkinDirectory, "Notes"))).length).toBe(4)

    const profileDirectory = path.join(root, "Save", "LocalProfiles", "00000004")
    expect(await readFile(path.join(profileDirectory, "Etterna.xml"), "utf8")).toMatch(
      /0123456789abcdef/,
    )
    expect(await readFile(path.join(profileDirectory, "Editable.ini"), "utf8")).toMatch(
      /CFG Username/,
    )
    await access(path.join(profileDirectory, "Type.ini"))
    await access(path.join(profileDirectory, "Rebirth_settings", "playerConfig.lua"))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function dependenciesWith(publisher: OutputSetPublisher): EtternaSkinInstallerDependencies {
  return {
    allocateProfileIdentity: async () => ({
      id: "00000004",
      guid: "0123456789abcdef",
    }),
    noteSkinWriter: { writeSkin: async () => {} },
    profileWriter: { writeProfile: async () => {} },
    judgementWriter: { writeJudgement: async () => {} },
    assetsConfigWriter: {
      prepareUpdate: async () => ({ content: "return {}", expectation: { state: "missing" } }),
      writeUpdate: async () => {},
    },
    publisher,
  }
}

function completeEtternaSkin(sourcePath: string): SkinModel {
  const image = { filePath: sourcePath, rotation: 0, pixelDensity: "standard" } as const
  return {
    ...etternaSkin,
    assets: {
      receptors: {
        left: { normal: image, pressed: image },
        down: { normal: image, pressed: image },
        up: { normal: image, pressed: image },
        right: { normal: image, pressed: image },
      },
      tapNotes: { left: image, down: image, up: image, right: image },
      judgements: {
        sourceDensity: 1,
        images: {
          marvelous: image,
          perfect: image,
          great: image,
          good: image,
          bad: image,
          miss: image,
        },
      },
    },
  }
}
