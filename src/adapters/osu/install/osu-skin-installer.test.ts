import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expectRejectionSatisfies, expectTruthy } from "../../../../tests/support/expectations.ts"
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
        expect(skin).toBe(osuSkin)
        expect(workspace).toBe("skin-staging")
      },
    },
    configWriter: {
      prepareUpdate: async (actualGameRoot, username, maniaSpeed) => {
        calls.push("prepare config")
        expect(actualGameRoot).toBe(gameRoot)
        expect(username).toBe("Stefany")
        expect(maniaSpeed).toBe(29)
        expect(Number.isInteger(maniaSpeed)).toBe(true)
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
        expect(targets.length).toBe(2)
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
  expect(calls).toStrictEqual([])

  await installer.installSkin(osuSkin)

  expect(calls).toStrictEqual(["prepare config", "publish", "write skin", "write config"])
  expectTruthy(publishedTargets)
  expect(
    publishedTargets.map(({ kind, targetPath, allowedRoot, policy }) => ({
      kind,
      targetPath,
      allowedRoot,
      policy,
    })),
  ).toStrictEqual([
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
  ])
  const configTarget = publishedTargets[1]
  expect(configTarget?.kind).toBe("file")
  if (configTarget?.kind === "file") {
    expect(configTarget.expectedContent).toBe(preparedUpdate.expectation)
  }
})

test("rejects the wrong game before preparing configuration or publishing", async () => {
  const sideEffects: string[] = []
  const dependencies = dependenciesWith(sideEffects)

  await expect(
    (() =>
      new OsuSkinInstaller(
        {
          gameRoot,
          windowsUsername: "Stefany",
          expectedSkinName: "Pink",
          skinTarget,
        },
        dependencies,
      ).installSkin({ ...osuSkin, game: "etterna" }))(),
  ).rejects.toThrow(/osu! installer.*etterna/i)

  expect(sideEffects).toStrictEqual([])
})

test("rejects a converted skin whose exact metadata name differs before side effects", async () => {
  const sideEffects: string[] = []
  const dependencies = dependenciesWith(sideEffects)

  await expect(
    (() =>
      new OsuSkinInstaller(
        {
          gameRoot,
          windowsUsername: "Stefany",
          expectedSkinName: "Pink",
          skinTarget,
        },
        dependencies,
      ).installSkin({ ...osuSkin, metadata: { name: "pink" } }))(),
  ).rejects.toThrow(/does not match the expected skin name/i)

  expect(sideEffects).toStrictEqual([])
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

  await expectRejectionSatisfies(
    (() =>
      new OsuSkinInstaller(
        {
          gameRoot,
          windowsUsername: "Stefany",
          expectedSkinName: "Pink",
          skinTarget,
        },
        dependencies,
      ).installSkin(osuSkin))(),
    (error) => error === failure,
  )
  expect(published).toBe(false)
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

    await expectRejectionSatisfies(
      (() =>
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
        ).installSkin(osuSkin))(),
      (error) => error instanceof Error && error.cause === promotionFailure,
    )

    expect(await readFile(path.join(actualSkinTarget, "original.txt"), "utf8")).toBe(
      "original skin",
    )
    await expect(
      (() => readFile(path.join(actualSkinTarget, "replacement.txt")))(),
    ).rejects.toMatchObject({
      code: "ENOENT",
    })
    expect(await readFile(configTarget, "utf8")).toBe(originalConfig)
    expect((await readdir(actualGameRoot)).sort()).toStrictEqual(["Skins", "osu!.Stefany.cfg"])
    expect(await readdir(skinsRoot)).toStrictEqual(["Pink"])
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
