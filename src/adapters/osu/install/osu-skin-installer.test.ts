import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import type { OutputSetTarget } from "../../../application/ports/output-set-publisher.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import { TransactionalOutputSetPublisher } from "../../../infrastructure/filesystem/transactional-output-set-publisher.ts"
import {
  prepareOsuUserConfigurationUpdate,
  writeOsuUserConfigurationUpdate,
} from "../config/prepare-osu-user-configuration-update.ts"
import { OsuSkinInstaller, type OsuSkinInstallerDependencies } from "./osu-skin-installer.ts"

const gameRoot = path.resolve("C:/osu!")
const skinTarget = path.join(gameRoot, "Skins", "Pink")

const osuSkin: SkinModel = {
  game: "osu",
  metadata: { name: "Pink" },
  playfield: {
    hitPosition: 480,
    judgementPosition: 300,
    comboPosition: 200,
    columnWidth: 64,
    comboScale: 1,
    judgementScale: 1,
    scrollSpeed: 29,
  },
  assets: {},
  diagnostics: [],
}

test("prepares and publishes the osu! skin and current user's CFG as one exact replacement set", async () => {
  const calls: string[] = []
  let publishedTargets: readonly OutputSetTarget[] | undefined
  const preparedUpdate = {
    targetPath: path.join(gameRoot, "osu!.Stefany.cfg"),
    content: "ManiaSpeed = 29\n",
    expectation: { state: "sha256", sha256: "a".repeat(64) } as const,
  }
  const dependencies: OsuSkinInstallerDependencies = {
    skinWriter: {
      writeSkin: async (skin, workspace) => {
        calls.push("write skin")
        assert.equal(skin, osuSkin)
        assert.equal(workspace, "skin-staging")
      },
    },
    configWriter: {
      prepareUpdate: async (actualGameRoot, username, maniaSpeed) => {
        calls.push("prepare config")
        assert.equal(actualGameRoot, gameRoot)
        assert.equal(username, "Stefany")
        assert.equal(maniaSpeed, 29)
        assert.equal(Number.isInteger(maniaSpeed), true)
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
        assert.equal(targets.length, 2)
        await targets[0]?.build("skin-staging")
        await targets[1]?.build("config-staging")
      },
    },
  }

  const installer = new OsuSkinInstaller(
    {
      gameRoot,
      windowsUsername: "Stefany",
      expectedSkinName: "Pink",
      skinTarget,
    },
    dependencies,
  )
  assert.deepEqual(calls, [])

  await installer.installSkin(osuSkin)

  assert.deepEqual(calls, ["prepare config", "publish", "write skin", "write config"])
  assert.ok(publishedTargets)
  assert.deepEqual(
    publishedTargets.map(({ kind, targetPath, allowedRoot, policy }) => ({
      kind,
      targetPath,
      allowedRoot,
      policy,
    })),
    [
      {
        kind: "directory",
        targetPath: skinTarget,
        allowedRoot: path.join(gameRoot, "Skins"),
        policy: "replace-existing",
      },
      {
        kind: "file",
        targetPath: preparedUpdate.targetPath,
        allowedRoot: gameRoot,
        policy: "replace-existing",
      },
    ],
  )
  const configTarget = publishedTargets[1]
  assert.equal(configTarget?.kind, "file")
  if (configTarget?.kind === "file") {
    assert.equal(configTarget.expectedContent, preparedUpdate.expectation)
  }
})

test("rejects the wrong game before preparing configuration or publishing", async () => {
  const sideEffects: string[] = []
  const dependencies = dependenciesWith(sideEffects)

  await assert.rejects(
    () =>
      new OsuSkinInstaller(
        {
          gameRoot,
          windowsUsername: "Stefany",
          expectedSkinName: "Pink",
          skinTarget,
        },
        dependencies,
      ).installSkin({ ...osuSkin, game: "etterna" }),
    /osu! installer.*etterna/i,
  )

  assert.deepEqual(sideEffects, [])
})

test("rejects a converted skin whose exact metadata name differs before side effects", async () => {
  const sideEffects: string[] = []
  const dependencies = dependenciesWith(sideEffects)

  await assert.rejects(
    () =>
      new OsuSkinInstaller(
        {
          gameRoot,
          windowsUsername: "Stefany",
          expectedSkinName: "Pink",
          skinTarget,
        },
        dependencies,
      ).installSkin({ ...osuSkin, metadata: { name: "pink" } }),
    /does not match the expected skin name/i,
  )

  assert.deepEqual(sideEffects, [])
})

test("does not publish when preparing the osu! CFG fails", async () => {
  const failure = new Error("invalid osu! CFG")
  let published = false
  const dependencies: OsuSkinInstallerDependencies = {
    ...dependenciesWith([]),
    configWriter: {
      prepareUpdate: async () => {
        throw failure
      },
      writeUpdate: async () => {},
    },
    publisher: {
      publish: async () => {
        published = true
      },
    },
  }

  await assert.rejects(
    () =>
      new OsuSkinInstaller(
        {
          gameRoot,
          windowsUsername: "Stefany",
          expectedSkinName: "Pink",
          skinTarget,
        },
        dependencies,
      ).installSkin(osuSkin),
    (error) => error === failure,
  )
  assert.equal(published, false)
})

test("restores the original skin and CFG when CFG promotion fails after skin promotion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-install-"))
  const actualGameRoot = path.join(root, "osu!")
  const skinsRoot = path.join(actualGameRoot, "Skins")
  const actualSkinTarget = path.join(skinsRoot, "Pink")
  const configTarget = path.join(actualGameRoot, "osu!.Stefany.cfg")
  const originalConfig = "Username = Stefany\r\nManiaSpeed = 10\r\n"
  const promotionFailure = new Error("CFG promotion failed")
  const publisher = new TransactionalOutputSetPublisher({
    rename: async (source, destination) => {
      if (path.basename(source) === "payload" && destination === configTarget) {
        throw promotionFailure
      }
      await rename(source, destination)
    },
  })

  try {
    await mkdir(actualSkinTarget, { recursive: true })
    await writeFile(path.join(actualSkinTarget, "original.txt"), "original skin")
    await writeFile(configTarget, originalConfig)

    await assert.rejects(
      () =>
        new OsuSkinInstaller(
          {
            gameRoot: actualGameRoot,
            windowsUsername: "Stefany",
            expectedSkinName: "Pink",
            skinTarget: actualSkinTarget,
          },
          {
            skinWriter: {
              writeSkin: async (_skin, workspace) => {
                await writeFile(path.join(workspace, "replacement.txt"), "replacement skin")
              },
            },
            configWriter: {
              prepareUpdate: prepareOsuUserConfigurationUpdate,
              writeUpdate: writeOsuUserConfigurationUpdate,
            },
            publisher,
          },
        ).installSkin(osuSkin),
      (error) => error instanceof Error && error.cause === promotionFailure,
    )

    assert.equal(
      await readFile(path.join(actualSkinTarget, "original.txt"), "utf8"),
      "original skin",
    )
    await assert.rejects(() => readFile(path.join(actualSkinTarget, "replacement.txt")), {
      code: "ENOENT",
    })
    assert.equal(await readFile(configTarget, "utf8"), originalConfig)
    assert.deepEqual((await readdir(actualGameRoot)).sort(), ["Skins", "osu!.Stefany.cfg"])
    assert.deepEqual(await readdir(skinsRoot), ["Pink"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function dependenciesWith(sideEffects: string[]): OsuSkinInstallerDependencies {
  return {
    skinWriter: {
      writeSkin: async () => {
        sideEffects.push("write skin")
      },
    },
    configWriter: {
      prepareUpdate: async () => {
        sideEffects.push("prepare config")
        return {
          targetPath: path.join(gameRoot, "osu!.Stefany.cfg"),
          content: "ManiaSpeed = 29\n",
          expectation: { state: "missing" },
        }
      },
      writeUpdate: async () => {
        sideEffects.push("write config")
      },
    },
    publisher: {
      publish: async () => {
        sideEffects.push("publish")
      },
    },
  }
}
