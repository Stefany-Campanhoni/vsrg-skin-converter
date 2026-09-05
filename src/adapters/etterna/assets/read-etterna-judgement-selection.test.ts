import { onTestFinished, test } from "bun:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { readEtternaJudgementSelection } from "./read-etterna-judgement-selection.ts"

interface SelectionFixture {
  root: string
  cleanup(): Promise<void>
}

async function createSelectionFixture(
  source: string,
  judgementFiles: readonly string[],
  theme = "Rebirth",
): Promise<SelectionFixture> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-selection-")))
  const settings = path.join(root, "Save", `${theme}_settings`)
  const judgements = path.join(root, "Assets", "Judgments")
  await mkdir(settings, { recursive: true })
  await mkdir(judgements, { recursive: true })
  await writeFile(path.join(settings, "assetsConfig.lua"), source)
  await Promise.all(
    judgementFiles.map((filename) =>
      writeFile(path.join(judgements, filename), Buffer.from("fixture")),
    ),
  )
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

test("selects the GUID-specific judgement file", async () => {
  const fixture = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected 1x6.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `,
    ["selected 1x6.png", "default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth")

  assert.equal(result.filePath, path.join(fixture.root, "Assets", "Judgments", "selected 1x6.png"))
  assert.deepEqual(result.diagnostics, [])
})

test("ignores Unicode in unselected judgement mappings", async () => {
  const fixture = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected 1x6.png",
        otherguid = "Assets/Judgments/陽気 ⌈Lite⌋ 1x6.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `,
    ["selected 1x6.png", "default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth")

  assert.equal(path.basename(result.filePath), "selected 1x6.png")
  assert.deepEqual(result.diagnostics, [])
})

test("selects a judgement whose path contains Unicode", async () => {
  const filename = "陽気 ⌈Lite⌋ 1x6.png"
  const fixture = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/${filename}",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `,
    [filename, "default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth")

  assert.equal(path.basename(result.filePath), filename)
  assert.deepEqual(result.diagnostics, [])
})

test("selects a Unicode judgement encoded as hexadecimal UTF-8 bytes", async () => {
  const filename = "気 1x6.png"
  const fixture = await createSelectionFixture(
    String.raw`
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/\xE6\xB0\x97 1x6.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `,
    [filename, "default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth")

  assert.equal(path.basename(result.filePath), filename)
  assert.deepEqual(result.diagnostics, [])
})

test("reads judgement configuration from the selected theme settings", async () => {
  const fixture = await createSelectionFixture(
    `return { judgment = { default = "Assets/Judgments/default 1x6.png" } }`,
    ["default 1x6.png"],
    "Custom",
  )
  onTestFinished(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid", "Custom")

  assert.equal(path.basename(result.filePath), "default 1x6.png")
})

test("adds the selected assetsConfig path and cause when configuration reading fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-config-failure-"))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const configPath = path.join(root, "Save", "Custom_settings", "assetsConfig.lua")

  await assert.rejects(
    () => readEtternaJudgementSelection(root, "fixtureguid", "Custom"),
    (error) =>
      error instanceof Error && error.message.includes(configPath) && error.cause instanceof Error,
  )
})

test("uses the default and warns when the GUID mapping is absent", async () => {
  const fixture = await createSelectionFixture(
    `
    return { judgment = { default = "Assets/Judgments/default 1x6.png" } }
  `,
    ["default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth")

  assert.equal(path.basename(result.filePath), "default 1x6.png")
  assert.deepEqual(result.diagnostics, [
    {
      code: "etterna-judgement-default-used",
      severity: "warning",
      component: "judgements",
      message:
        "No judgement was configured for GUID fixtureguid; using Assets/Judgments/default 1x6.png",
    },
  ])
})

test("uses the default and warns when the selected file is missing", async () => {
  const fixture = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/missing 1x6.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `,
    ["default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth")

  assert.equal(path.basename(result.filePath), "default 1x6.png")
  assert.deepEqual(result.diagnostics, [
    {
      code: "etterna-judgement-file-missing",
      severity: "warning",
      component: "judgements",
      message:
        "Configured judgement Assets/Judgments/missing 1x6.png does not exist; using Assets/Judgments/default 1x6.png",
    },
  ])
})

test("rejects traversal encoded with decimal Lua escapes", async () => {
  const fixture = await createSelectionFixture(
    String.raw`
      return {
        judgment = {
          fixtureguid = "Assets\047..\047outside.png",
          default = "Assets/Judgments/default 1x6.png",
        },
      }
    `,
    ["default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  await assert.rejects(
    () => readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth"),
    /unsafe.*judgement.*path/i,
  )
})

test("rejects traversal encoded with hexadecimal Lua escapes", async () => {
  const fixture = await createSelectionFixture(
    String.raw`
      return {
        judgment = {
          fixtureguid = "Assets\x2f..\x2foutside.png",
          default = "Assets/Judgments/default 1x6.png",
        },
      }
    `,
    ["default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  await assert.rejects(
    () => readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth"),
    /unsafe.*judgement.*path/i,
  )
})

test("rejects unsafe paths and unusable defaults", async () => {
  const unsafe = await createSelectionFixture(
    `
    return { judgment = { fixtureguid = "../outside.png", default = "Assets/Judgments/default 1x6.png" } }
  `,
    ["default 1x6.png"],
  )
  onTestFinished(unsafe.cleanup)
  await assert.rejects(
    () => readEtternaJudgementSelection(unsafe.root, "fixtureguid", "Rebirth"),
    /unsafe.*judgement.*path/i,
  )

  const missingDefault = await createSelectionFixture(
    `
    return { judgment = { default = "Assets/Judgments/missing 1x6.png" } }
  `,
    [],
  )
  onTestFinished(missingDefault.cleanup)
  await assert.rejects(
    () => readEtternaJudgementSelection(missingDefault.root, "fixtureguid", "Rebirth"),
    /default.*does not exist/i,
  )
})

test("rejects an unsafe default even when the selected file exists", async () => {
  const fixture = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected 1x6.png",
        default = "../outside.png",
      },
    }
  `,
    ["selected 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  await assert.rejects(
    () => readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth"),
    /unsafe.*judgement.*path/i,
  )
})

test("rejects malformed configuration with its path", async () => {
  const fixture = await createSelectionFixture("return { judgment = {", [])
  onTestFinished(fixture.cleanup)

  await assert.rejects(
    () => readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth"),
    /assetsConfig\.lua/i,
  )
})

test("rejects absolute paths and unsupported image extensions", async () => {
  const absolute = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "/outside.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `,
    ["default 1x6.png"],
  )
  onTestFinished(absolute.cleanup)
  await assert.rejects(
    () => readEtternaJudgementSelection(absolute.root, "fixtureguid", "Rebirth"),
    /unsafe.*judgement.*path/i,
  )

  const unsupported = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected.gif",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `,
    ["selected.gif", "default 1x6.png"],
  )
  onTestFinished(unsupported.cleanup)
  await assert.rejects(
    () => readEtternaJudgementSelection(unsupported.root, "fixtureguid", "Rebirth"),
    /unsupported.*judgement.*image/i,
  )
})

test("requires a usable default even when the selected file exists", async () => {
  const fixture = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected 1x6.png",
        default = "Assets/Judgments/missing 1x6.png",
      },
    }
  `,
    ["selected 1x6.png"],
  )
  onTestFinished(fixture.cleanup)

  await assert.rejects(
    () => readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth"),
    /default.*does not exist/i,
  )
})

test("rejects a selected file whose real path escapes the game root", async () => {
  const fixture = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/escape/outside.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `,
    ["default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)
  const outside = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-outside-"))
  onTestFinished(() => rm(outside, { recursive: true, force: true }))
  await writeFile(path.join(outside, "outside.png"), Buffer.from("outside"))
  await symlink(outside, path.join(fixture.root, "Assets", "Judgments", "escape"), "junction")

  await assert.rejects(
    () => readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth"),
    /unsafe.*judgement.*path/i,
  )
})

test("uses the default when the selected path is not a regular file", async () => {
  const fixture = await createSelectionFixture(
    `
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `,
    ["default 1x6.png"],
  )
  onTestFinished(fixture.cleanup)
  await mkdir(path.join(fixture.root, "Assets", "Judgments", "selected.png"))

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid", "Rebirth")

  assert.equal(path.basename(result.filePath), "default 1x6.png")
  assert.equal(result.diagnostics[0]?.code, "etterna-judgement-file-missing")
  assert.equal(result.diagnostics[0]?.component, "judgements")
})
