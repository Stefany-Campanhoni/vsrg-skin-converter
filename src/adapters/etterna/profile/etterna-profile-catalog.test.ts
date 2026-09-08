import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expectRejectionSatisfies } from "../../../../tests/support/expectations.ts"
import { extractEtternaProfileDisplayName, listEtternaProfiles } from "./etterna-profile-catalog.ts"

test("extracts a trimmed Etterna profile display name", () => {
  expect(
    extractEtternaProfileDisplayName("<Stats><DisplayName> porquispinho </DisplayName></Stats>"),
  ).toBe("porquispinho")
})

test("uses unknown when the Etterna profile display name is missing or empty", () => {
  expect(extractEtternaProfileDisplayName("<Stats />")).toBe("unknown")
  expect(extractEtternaProfileDisplayName("<DisplayName> </DisplayName>")).toBe("unknown")
})

test("lists immediate Etterna profiles in directory-ID order", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-profiles-"))
  try {
    await writeProfile(root, "00000001", "Second")
    await writeProfile(root, "00000000", "First")

    expect(await listEtternaProfiles(root)).toStrictEqual([
      { id: "00000000", displayName: "First" },
      { id: "00000001", displayName: "Second" },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects when LocalProfiles contains no profile directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-empty-profiles-"))
  try {
    await mkdir(path.join(root, "Save", "LocalProfiles"), { recursive: true })

    await expect((() => listEtternaProfiles(root))()).rejects.toThrow(/No Etterna profiles found/i)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("starts and settles every profile read before rethrowing the first failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-profile-read-failure-"))
  const pendingRead = deferred<string>()
  const readsStarted = deferred<void>()
  const failure = new Error("exact profile read failure")
  let readCalls = 0
  try {
    await writeProfile(root, "00000000", "First")
    await writeProfile(root, "00000001", "Second")

    const listing = listEtternaProfiles(root, {
      readProfileSource: (filePath) => {
        readCalls += 1
        if (readCalls === 2) {
          readsStarted.resolve()
        }
        if (filePath.includes("00000000")) {
          return pendingRead.promise
        }
        throw failure
      },
    })

    const phase = await Promise.race([
      readsStarted.promise.then(() => "started"),
      listing.then(
        () => "completed",
        () => "rejected",
      ),
    ])
    expect(phase).toBe("started")
    let settled = false
    void listing.catch(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    pendingRead.resolve("<DisplayName>First</DisplayName>")
    await expectRejectionSatisfies(
      listing,
      (error) =>
        error instanceof Error &&
        error.cause === failure &&
        /00000001.*Etterna\.xml/i.test(error.message),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeProfile(root: string, id: string, displayName: string): Promise<void> {
  const directory = path.join(root, "Save", "LocalProfiles", id)
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, "Etterna.xml"),
    `<Stats><GeneralData><DisplayName>${displayName}</DisplayName></GeneralData></Stats>`,
  )
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"]
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
