import { test } from "bun:test"
import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { SkinModel } from "../../../domain/skin.ts"
import { EtternaProfileWriter } from "./etterna-profile-writer.ts"

test("copies and renders the profile template with only playerConfig below the active theme", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-profile-writer-"))
  const templates = path.join(root, "templates")
  const workspace = path.join(root, "workspace")
  try {
    await writeProfileTemplate(templates)

    await new EtternaProfileWriter(templates).writeProfile(etternaSkin, workspace, {
      profileName: "A&B <Player>",
      guid: "0123456789abcdef",
      theme: "Rebirth",
    })

    assert.deepEqual((await readdir(workspace)).sort(), [
      "Editable.ini",
      "Etterna.xml",
      "Rebirth_settings",
      "Type.ini",
    ])
    assert.deepEqual(await readdir(path.join(workspace, "Rebirth_settings")), ["playerConfig.lua"])
    assert.equal(
      await readFile(path.join(workspace, "Editable.ini"), "utf8"),
      "[Editable]\nDisplayName=A&B <Player>\n",
    )
    assert.equal(
      await readFile(path.join(workspace, "Etterna.xml"), "utf8"),
      "<DisplayName>A&amp;B &lt;Player&gt;</DisplayName>\n<Guid>0123456789abcdef</Guid>\n<dance>C888, Reverse, Overhead, Converted NoteSkin</dance>\n",
    )
    assert.equal(await readFile(path.join(workspace, "Type.ini"), "utf8"), "profile type")
    assert.equal(
      await readFile(path.join(workspace, "Rebirth_settings", "playerConfig.lua"), "utf8"),
      "return { ReceptorSize= 107, NoteFieldY= -6, ComboY= -20, JudgmentY= 4, JudgmentZoom= 0.35, ComboZoom= 0.5 }\n",
    )
    await assert.rejects(() => access(path.join(workspace, "assetsConfig.lua")), { code: "ENOENT" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects a non-Etterna model before copying the profile template", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-profile-writer-"))
  const templates = path.join(root, "templates")
  const workspace = path.join(root, "workspace")
  try {
    await writeProfileTemplate(templates)

    await assert.rejects(
      () =>
        new EtternaProfileWriter(templates).writeProfile(
          { ...etternaSkin, game: "osu" },
          workspace,
          {
            profileName: "Player",
            guid: "0123456789abcdef",
            theme: "Rebirth",
          },
        ),
      /Etterna profile writer.*osu/i,
    )
    await assert.rejects(() => access(workspace), { code: "ENOENT" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

const etternaSkin: SkinModel = {
  game: "etterna",
  metadata: { name: "Converted NoteSkin" },
  playfield: {
    hitPosition: -7,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 107,
    comboScale: 0.5,
    judgementScale: 1,
    scrollSpeed: 888,
  },
  assets: {},
  diagnostics: [],
}

async function writeProfileTemplate(templates: string): Promise<void> {
  await mkdir(templates)
  await Promise.all([
    writeFile(path.join(templates, "Editable.ini"), `[Editable]\nDisplayName=\${profile_name}\n`),
    writeFile(
      path.join(templates, "Etterna.xml"),
      `<DisplayName>\${profile_name}</DisplayName>\n<Guid>\${guid}</Guid>\n<dance>C\${cmod}, \${is_downscroll} Overhead, \${skin_name}</dance>\n`,
    ),
    writeFile(path.join(templates, "Type.ini"), "profile type"),
    writeFile(
      path.join(templates, "playerConfig.lua"),
      `return { ReceptorSize= \${receptor_size}, NoteFieldY= \${hit_position}, ComboY= \${combo_position}, JudgmentY= \${judgement_position}, JudgmentZoom= 0.35, ComboZoom= \${combo_zoom} }\n`,
    ),
  ])
}
