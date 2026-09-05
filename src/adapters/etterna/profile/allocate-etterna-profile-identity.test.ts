import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { allocateEtternaProfileIdentity } from "./allocate-etterna-profile-identity.ts"

async function withGameRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-profile-identity-"))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function profileDirectory(root: string, id: string): string {
  return path.join(root, "Save", "LocalProfiles", id)
}

async function writeProfile(
  root: string,
  id: string,
  source = "<Guid>existing-guid</Guid>",
): Promise<void> {
  const directory = profileDirectory(root, id)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, "Etterna.xml"), source)
}

test("allocates ID 00000000 when LocalProfiles is missing", async () => {
  await withGameRoot(async (root) => {
    const identity = await allocateEtternaProfileIdentity(root, {
      randomBytes: () => Buffer.from("0123456789abcdef", "hex"),
    })

    assert.equal(identity.id, "00000000")
  })
})

test("allocates ID 00000000 when LocalProfiles is empty", async () => {
  await withGameRoot(async (root) => {
    await mkdir(path.join(root, "Save", "LocalProfiles"), { recursive: true })

    const identity = await allocateEtternaProfileIdentity(root, {
      randomBytes: () => Buffer.from("0123456789abcdef", "hex"),
    })

    assert.equal(identity.id, "00000000")
  })
})

test("allocates one above the maximum valid eight-digit profile directory", async () => {
  await withGameRoot(async (root) => {
    await writeProfile(root, "00000003")
    await writeProfile(root, "00000008")
    await writeProfile(root, "not-a-profile")
    await writeProfile(root, "0000000")
    await writeProfile(root, "000000000")
    await writeProfile(root, "abcdefgh")

    const identity = await allocateEtternaProfileIdentity(root, {
      randomBytes: () => Buffer.from("0123456789abcdef", "hex"),
    })

    assert.equal(identity.id, "00000009")
  })
})

test("does not reuse gaps between valid profile directory IDs", async () => {
  await withGameRoot(async (root) => {
    await writeProfile(root, "00000000")
    await writeProfile(root, "00000002")

    const identity = await allocateEtternaProfileIdentity(root, {
      randomBytes: () => Buffer.from("0123456789abcdef", "hex"),
    })

    assert.equal(identity.id, "00000003")
  })
})

test("ignores an exact eight-digit regular file when allocating the next profile ID", async () => {
  await withGameRoot(async (root) => {
    await writeProfile(root, "00000003")
    await writeFile(profileDirectory(root, "00000009"), "not a profile directory")

    const identity = await allocateEtternaProfileIdentity(root, {
      randomBytes: () => Buffer.from("0123456789abcdef", "hex"),
    })

    assert.equal(identity.id, "00000004")
  })
})

test("keeps non-missing LocalProfiles listing failures fatal", async () => {
  await withGameRoot(async (root) => {
    await mkdir(path.join(root, "Save"), { recursive: true })
    await writeFile(path.join(root, "Save", "LocalProfiles"), "not a directory")

    await assert.rejects(
      () => allocateEtternaProfileIdentity(root),
      (error) =>
        error instanceof Error &&
        /Could not list Etterna profiles/.test(error.message) &&
        error.cause instanceof Error,
    )
  })
})

test("rejects when the maximum valid profile directory ID cannot be incremented", async () => {
  await withGameRoot(async (root) => {
    await writeProfile(root, "99999999")

    await assert.rejects(() => allocateEtternaProfileIdentity(root), /99999999|profile ID/i)
  })
})

test("retries a generated GUID collision and returns 16 lower-case hexadecimal characters", async () => {
  await withGameRoot(async (root) => {
    await writeProfile(root, "00000000", "<Guid>aaaaaaaaaaaaaaaa</Guid>")
    const values = [Buffer.from("aaaaaaaaaaaaaaaa", "hex"), Buffer.from("0123456789abcdef", "hex")]

    const identity = await allocateEtternaProfileIdentity(root, {
      randomBytes: () => values.shift() ?? Buffer.alloc(8),
    })

    assert.equal(identity.guid, "0123456789abcdef")
    assert.match(identity.guid, /^[0-9a-f]{16}$/)
  })
})

test("rejects when GUID collision retries are exhausted", async () => {
  await withGameRoot(async (root) => {
    await writeProfile(root, "00000000", "<Guid>aaaaaaaaaaaaaaaa</Guid>")

    await assert.rejects(
      () =>
        allocateEtternaProfileIdentity(root, {
          maxGuidAttempts: 2,
          randomBytes: () => Buffer.from("aaaaaaaaaaaaaaaa", "hex"),
        }),
      /GUID.*attempt|attempt.*GUID/i,
    )
  })
})

test("rejects random byte sources that do not return exactly eight bytes", async () => {
  await withGameRoot(async (root) => {
    await assert.rejects(
      () =>
        allocateEtternaProfileIdentity(root, {
          randomBytes: () => Buffer.alloc(7),
        }),
      /eight.*bytes|8.*bytes/i,
    )
  })
})

test("rejects a valid profile with a missing Etterna.xml using profile context", async () => {
  await withGameRoot(async (root) => {
    await mkdir(profileDirectory(root, "00000000"), { recursive: true })

    await assert.rejects(
      () => allocateEtternaProfileIdentity(root),
      (error) =>
        error instanceof Error &&
        error.message.includes("00000000") &&
        error.message.includes(path.join("00000000", "Etterna.xml")) &&
        error.cause instanceof Error,
    )
  })
})

test("rejects a valid profile with unreadable Etterna.xml using profile context", async () => {
  await withGameRoot(async (root) => {
    const directory = profileDirectory(root, "00000000")
    await mkdir(path.join(directory, "Etterna.xml"), { recursive: true })

    await assert.rejects(
      () => allocateEtternaProfileIdentity(root),
      (error) =>
        error instanceof Error &&
        error.message.includes("00000000") &&
        error.message.includes(path.join("00000000", "Etterna.xml")) &&
        error.cause instanceof Error,
    )
  })
})

test("rejects a valid profile with a missing GUID using profile context", async () => {
  await withGameRoot(async (root) => {
    await writeProfile(root, "00000000", "<Stats />")

    await assert.rejects(
      () => allocateEtternaProfileIdentity(root),
      (error) =>
        error instanceof Error &&
        error.message.includes("00000000") &&
        error.message.includes(path.join("00000000", "Etterna.xml")) &&
        error.cause instanceof Error,
    )
  })
})
