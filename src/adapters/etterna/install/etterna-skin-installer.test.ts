import assert from "node:assert/strict"
import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
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
      assert.equal(actualGameRoot, gameRoot)
      return { id: "00000004", guid: "0123456789abcdef" }
    },
    noteSkinWriter: {
      writeSkin: async (skin, workspace) => {
        calls.push("write NoteSkin")
        assert.equal(skin, etternaSkin)
        assert.equal(workspace, "noteskin-staging")
      },
    },
    profileWriter: {
      writeProfile: async (skin, workspace, configuration) => {
        calls.push("write profile")
        assert.equal(skin, etternaSkin)
        assert.equal(workspace, "profile-staging")
        assert.deepEqual(configuration, {
          profileName: "CFG Username",
          guid: "0123456789abcdef",
          theme: "Rebirth",
        })
      },
    },
    judgementWriter: {
      writeJudgement: async (skin, stagingFile) => {
        calls.push("write judgement")
        assert.equal(skin, etternaSkin)
        assert.equal(stagingFile, "judgement-staging")
      },
    },
    assetsConfigWriter: {
      prepareUpdate: async (filePath, guid, relativeJudgementPath) => {
        calls.push("prepare config")
        assert.equal(filePath, path.join(gameRoot, "Save", "Rebirth_settings", "assetsConfig.lua"))
        assert.equal(guid, "0123456789abcdef")
        assert.equal(
          relativeJudgementPath,
          "Assets/Judgments/Converted Skin (osu!) - 0123456789abcdef 1x6 (Doubleres).png",
        )
        return preparedUpdate
      },
      writeUpdate: async (stagingFile, update) => {
        calls.push("write config")
        assert.equal(stagingFile, "config-staging")
        assert.equal(update, preparedUpdate)
      },
    },
    publisher: {
      publish: async (targets) => {
        calls.push("publish")
        publishedTargets = targets
        assert.equal(targets.length, 4)
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

  assert.deepEqual(calls, [
    "allocate",
    "prepare config",
    "publish",
    "write NoteSkin",
    "write profile",
    "write judgement",
    "write config",
  ])
  assert.ok(publishedTargets)
  assert.deepEqual(
    publishedTargets.map((target) => ({
      kind: target.kind,
      targetPath: target.targetPath,
      allowedRoot: target.allowedRoot,
      policy: target.policy,
      expectedContent: target.kind === "file" ? target.expectedContent : undefined,
    })),
    [
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
    ],
  )
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

  assert.deepEqual(policies, [
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

  await assert.rejects(
    () =>
      new EtternaSkinInstaller(
        {
          gameRoot,
          profileName: "CFG Username",
          theme: "Rebirth",
          expectedNoteSkinName: etternaSkin.metadata.name,
          overwriteExistingNoteSkin: false,
        },
        dependencies,
      ).installSkin({ ...etternaSkin, game: "osu" }),
    /Etterna installer.*osu/i,
  )

  assert.equal(allocationStarted, false)
  assert.equal(publicationStarted, false)
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

  await assert.rejects(
    () =>
      new EtternaSkinInstaller(
        {
          gameRoot,
          profileName: "CFG Username",
          theme: "Rebirth",
          expectedNoteSkinName: "Selected NoteSkin A",
          overwriteExistingNoteSkin: false,
        },
        guardedDependencies,
      ).installSkin({ ...etternaSkin, metadata: { name: "Parsed skin.ini Name B" } }),
    /does not match the expected NoteSkin name/i,
  )

  assert.equal(allocationStarted, false)
  assert.equal(publicationStarted, false)
  assert.equal(writerStarted, false)
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

  await assert.rejects(
    () =>
      new EtternaSkinInstaller(
        {
          gameRoot,
          profileName: "CFG Username",
          theme: "Rebirth",
          expectedNoteSkinName: etternaSkin.metadata.name,
          overwriteExistingNoteSkin: false,
        },
        dependencies,
      ).installSkin({ ...etternaSkin, assets: { ...etternaSkin.assets, judgements: undefined } }),
    /does not contain judgements/i,
  )
  assert.equal(allocated, false)
  assert.equal(published, false)
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

  await assert.rejects(
    () =>
      new EtternaSkinInstaller(
        {
          gameRoot,
          profileName: "CFG Username",
          theme: "Rebirth",
          expectedNoteSkinName: etternaSkin.metadata.name,
          overwriteExistingNoteSkin: false,
        },
        dependencies,
      ).installSkin(etternaSkin),
    (error) => error === failure,
  )
  assert.equal(published, false)
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
    assert.ok((await readdir(path.join(noteSkinDirectory, "Holds"))).length > 0)
    assert.ok((await readdir(path.join(noteSkinDirectory, "Misc"))).length > 0)
    assert.equal((await readdir(path.join(noteSkinDirectory, "Receptors"))).length, 8)
    assert.equal((await readdir(path.join(noteSkinDirectory, "Notes"))).length, 4)

    const profileDirectory = path.join(root, "Save", "LocalProfiles", "00000004")
    assert.match(
      await readFile(path.join(profileDirectory, "Etterna.xml"), "utf8"),
      /0123456789abcdef/,
    )
    assert.match(
      await readFile(path.join(profileDirectory, "Editable.ini"), "utf8"),
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
