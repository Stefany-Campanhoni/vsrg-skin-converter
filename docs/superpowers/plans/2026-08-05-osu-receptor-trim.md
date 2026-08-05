# osu! Receptor Vertical Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an npm command that trims transparent top and bottom rows from `.tmp/key.png` and writes `.tmp/key-trimmed.png`.

**Architecture:** A focused image utility uses Sharp's `trim()` to find the visible bounding box, then extracts its vertical span at the original width. A thin script invokes that utility for the fixed temporary paths and prints the dimensions.

**Tech Stack:** Node.js 22+, TypeScript, `node:test`, Sharp.

## Global Constraints

- Preserve the original receptor and its 75-pixel width.
- Remove only fully transparent space above and below the visible image.
- Use Sharp's `trim()` to determine the non-transparent vertical bounds.
- Do not modify the main skin-conversion flow.

---

## File Structure

- Create `src/infrastructure/image/trim-transparent-vertical-space.ts`: exposes `trimTransparentVerticalSpace(image: Buffer): Promise<Buffer>`.
- Create `src/infrastructure/image/trim-transparent-vertical-space.test.ts`: verifies the utility with a synthetic RGBA PNG.
- Create `src/scripts/trim-osu-receptor.ts`: reads and writes the temporary receptor and logs dimensions.
- Create `src/scripts/trim-osu-receptor.test.ts`: verifies the executable function using the supplied receptor.
- Modify `package.json`: adds `test:trim-osu-receptor`.

### Task 1: Vertical trim utility

**Files:**
- Create: `src/infrastructure/image/trim-transparent-vertical-space.ts`
- Test: `src/infrastructure/image/trim-transparent-vertical-space.test.ts`

**Interfaces:**
- Consumes: an encoded image `Buffer`.
- Produces: `trimTransparentVerticalSpace(image: Buffer): Promise<Buffer>`, an RGBA PNG with original width and no transparent vertical padding.

- [ ] **Step 1: Write the failing test**

```ts
test("removes transparent vertical padding while preserving width and visible pixels", async () => {
  const pixels = Buffer.alloc(4 * 6 * 4)
  for (let y = 1; y <= 4; y += 1) for (let x = 0; x < 4; x += 1) {
    const offset = (y * 4 + x) * 4
    pixels.set([20, 40, 60, 255], offset)
  }
  const image = await sharp(pixels, { raw: { width: 4, height: 6, channels: 4 } }).png().toBuffer()
  const trimmed = await trimTransparentVerticalSpace(image)
  const metadata = await sharp(trimmed).metadata()
  const raw = await sharp(trimmed).raw().toBuffer({ resolveWithObject: true })
  assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 4, height: 4 })
  assert.equal(raw.data[3], 255)
  assert.equal(raw.data[raw.data.length - 1], 255)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/infrastructure/image/trim-transparent-vertical-space.test.ts`  
Expected: FAIL because the utility module does not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
export async function trimTransparentVerticalSpace(image: Buffer): Promise<Buffer> {
  const source = sharp(image).ensureAlpha()
  const metadata = await source.metadata()
  if (!metadata.width || !metadata.height) throw new Error("Could not read image dimensions")
  const trimmed = await source.clone().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer({ resolveWithObject: true })
  const top = trimmed.info.trimOffsetTop
  if (top === undefined || !trimmed.info.height) throw new Error("Could not detect visible image bounds")
  return source.extract({ left: 0, top, width: metadata.width, height: trimmed.info.height }).png().toBuffer()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/infrastructure/image/trim-transparent-vertical-space.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/image/trim-transparent-vertical-space.ts src/infrastructure/image/trim-transparent-vertical-space.test.ts
git commit -m "feat: trim transparent receptor padding"
```

### Task 2: Executable npm command

**Files:**
- Create: `src/scripts/trim-osu-receptor.ts`
- Create: `src/scripts/trim-osu-receptor.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `.tmp/key.png` and `trimTransparentVerticalSpace(image: Buffer): Promise<Buffer>`.
- Produces: `.tmp/key-trimmed.png` and `npm run test:trim-osu-receptor`.

- [ ] **Step 1: Write the failing test**

```ts
test("writes a vertically trimmed receptor PNG", async () => {
  const outputPath = ".tmp/key-trimmed.test.png"
  await runTrimOsuReceptor(".tmp/key.png", outputPath)
  const output = await sharp(await readFile(outputPath)).metadata()
  await rm(outputPath)
  assert.equal(output.width, 75)
  assert.ok((output.height ?? 0) < 187)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/scripts/trim-osu-receptor.test.ts`  
Expected: FAIL because the script module does not exist.

- [ ] **Step 3: Write the minimal implementation and npm entry**

```ts
export async function runTrimOsuReceptor(inputPath: string, outputPath: string): Promise<void> {
  const input = await readFile(inputPath)
  const before = await sharp(input).metadata()
  const output = await trimTransparentVerticalSpace(input)
  const after = await sharp(output).metadata()
  await writeFile(outputPath, output)
  console.log(`Trimmed ${before.width}x${before.height} to ${after.width}x${after.height}: ${outputPath}`)
}
if (import.meta.main) await runTrimOsuReceptor(".tmp/key.png", ".tmp/key-trimmed.png")
```

Add: `"test:trim-osu-receptor": "node src/scripts/trim-osu-receptor.ts"`.

- [ ] **Step 4: Run tests and the npm command**

Run: `npm test -- src/scripts/trim-osu-receptor.test.ts && npm run test:trim-osu-receptor`  
Expected: PASS; `.tmp/key-trimmed.png` exists, has width 75, and is shorter than 187 pixels.

- [ ] **Step 5: Commit**

```bash
git add package.json src/scripts/trim-osu-receptor.ts src/scripts/trim-osu-receptor.test.ts
git commit -m "feat: add osu receptor trim test command"
```
