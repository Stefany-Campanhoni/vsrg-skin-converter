import { expect, onTestFinished, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { listOsuUserConfigurations, parseOsuUserConfiguration } from "./osu-user-configuration.ts"

test("uses the active fullscreen resolution and marks larger displays as double resolution", () => {
  const result = parseOsuUserConfiguration(
    `Username = Alice
Fullscreen = 1
Width = 1280
Height = 720
WidthFullscreen = 1920
HeightFullscreen = 1080
ManiaSpeed = 29`,
    "C:/osu!/osu!.Alice.cfg",
  )

  expect(result.username).toBe("Alice")
  expect(result.width).toBe(1920)
  expect(result.height).toBe(1080)
  expect(result.useDoubleResolutionAssets).toBe(true)
})

test("uses the windowed resolution when fullscreen is disabled", () => {
  const result = parseOsuUserConfiguration(
    `username = Alice=Player
fullscreen = 0
width = 1024
height = 768
Width = 1280
ManiaSpeed = 29`,
    "C:/osu!/osu!.Alice.cfg",
  )

  expect(result.username).toBe("Alice=Player")
  expect(result.width).toBe(1280)
  expect(result.height).toBe(768)
  expect(result.useDoubleResolutionAssets).toBe(true)
})

test("keeps exactly 1280x720 at standard resolution", () => {
  const result = parseOsuUserConfiguration(
    `Username = Alice
Fullscreen = 0
Width = 1280
Height = 720
ManiaSpeed = 29`,
    "C:/osu!/osu!.Alice.cfg",
  )

  expect(result.useDoubleResolutionAssets).toBe(false)
})

test("reads the positive integer ManiaSpeed from the selected osu configuration", () => {
  const result = parseOsuUserConfiguration(
    "Username = Alice\nFullscreen = 0\nWidth = 1280\nHeight = 720\nManiaSpeed = 29",
    "C:/osu!/osu!.Alice.cfg",
  )

  expect(result.maniaSpeed).toBe(29)
})

test("rejects missing and non-positive or non-integer ManiaSpeed values with the configuration path", () => {
  for (const invalid of ["", "0", "29.5", "fast"]) {
    expect(() =>
      parseOsuUserConfiguration(
        `Username = Alice\nFullscreen = 0\nWidth = 1280\nHeight = 720\nManiaSpeed = ${invalid}`,
        "C:/osu!/osu!.Alice.cfg",
      ),
    ).toThrow(/ManiaSpeed.*osu!\.Alice\.cfg/i)
  }
})

test("marks a width-only high resolution display as double resolution", () => {
  const result = parseOsuUserConfiguration(
    `Username = Alice
Fullscreen = 0
Width = 1281
Height = 720
ManiaSpeed = 29`,
    "C:/osu!/osu!.Alice.cfg",
  )

  expect(result.useDoubleResolutionAssets).toBe(true)
})

test("marks a height-only high resolution display as double resolution", () => {
  const result = parseOsuUserConfiguration(
    `Username = Alice
Fullscreen = 0
Width = 1280
Height = 721
ManiaSpeed = 29`,
    "C:/osu!/osu!.Alice.cfg",
  )

  expect(result.useDoubleResolutionAssets).toBe(true)
})

test("rejects missing required properties with the configuration path", () => {
  expect(() =>
    parseOsuUserConfiguration(
      "Username = Alice\nFullscreen = 0\nWidth = 1280",
      "C:/osu!/missing.cfg",
    ),
  ).toThrow(/C:\/osu!\/missing\.cfg/)
})

test("rejects an invalid fullscreen value with the configuration path", () => {
  expect(() =>
    parseOsuUserConfiguration(
      "Username = Alice\nFullscreen = yes\nWidth = 1280\nHeight = 720",
      "C:/osu!/invalid-fullscreen.cfg",
    ),
  ).toThrow(/C:\/osu!\/invalid-fullscreen\.cfg/)
})

test("rejects non-positive active dimensions with the configuration path", () => {
  expect(() =>
    parseOsuUserConfiguration(
      "Username = Alice\nFullscreen = 0\nWidth = 0\nHeight = -1",
      "C:/osu!/invalid-dimensions.cfg",
    ),
  ).toThrow(/C:\/osu!\/invalid-dimensions\.cfg/)
})

test("rejects empty and multiline usernames with the configuration path", () => {
  expect(() =>
    parseOsuUserConfiguration(
      "Username =   \nFullscreen = 0\nWidth = 1280\nHeight = 720",
      "C:/osu!/empty-username.cfg",
    ),
  ).toThrow(/C:\/osu!\/empty-username\.cfg/)
  expect(() =>
    parseOsuUserConfiguration(
      "Username = Alice\u2028Bob\nFullscreen = 0\nWidth = 1280\nHeight = 720",
      "C:/osu!/multiline-username.cfg",
    ),
  ).toThrow(/C:\/osu!\/multiline-username\.cfg/)
})

test("lists immediate osu user configurations by username", async () => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "osu-configurations-"))
  onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))
  await writeConfiguration(osuRoot, "osu!.Alice.cfg", "Alice")
  await writeConfiguration(osuRoot, "osu!.Bob.CFG", "Bob")
  await writeConfiguration(osuRoot, "osu!.cfg", "Ignored")
  await writeConfiguration(osuRoot, "unrelated.txt", "Ignored")
  await mkdir(path.join(osuRoot, "osu!.Directory.cfg"))

  expect(await listOsuUserConfigurations(osuRoot)).toStrictEqual([
    {
      filePath: path.join(osuRoot, "osu!.Alice.cfg"),
      username: "Alice",
      width: 1280,
      height: 720,
      maniaSpeed: 29,
      useDoubleResolutionAssets: false,
    },
    {
      filePath: path.join(osuRoot, "osu!.Bob.CFG"),
      username: "Bob",
      width: 1280,
      height: 720,
      maniaSpeed: 29,
      useDoubleResolutionAssets: false,
    },
  ])
})

test("rejects an osu root that contains no user configurations", async () => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "empty-osu-configurations-"))
  onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))

  await expect((() => listOsuUserConfigurations(osuRoot))()).rejects.toThrow(
    new RegExp(osuRoot.replace(/\\/g, "\\\\")),
  )
})

async function writeConfiguration(root: string, fileName: string, username: string): Promise<void> {
  await writeFile(
    path.join(root, fileName),
    `Username = ${username}\nFullscreen = 0\nWidth = 1280\nHeight = 720\nManiaSpeed = 29`,
  )
}
