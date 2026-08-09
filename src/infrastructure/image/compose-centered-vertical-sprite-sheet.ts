import sharp from "sharp"
import { invokeAsPromise, settleAll } from "../async/settle-all.ts"

export interface CenteredSpriteSheetFrame {
  readonly label: string
  readonly image: Buffer
}

export interface DecodedSpriteSheetFrame {
  readonly data: Buffer
  readonly width: number
  readonly height: number
}

export interface ComposeCenteredVerticalSpriteSheetDependencies {
  decode(image: Buffer, index: number): Promise<DecodedSpriteSheetFrame>
}

const defaultDependencies: ComposeCenteredVerticalSpriteSheetDependencies = {
  decode: async (image) => {
    const { data, info } = await sharp(image)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  },
}

export async function composeCenteredVerticalSpriteSheet(
  frames: readonly CenteredSpriteSheetFrame[],
  dependencies: ComposeCenteredVerticalSpriteSheetDependencies = defaultDependencies,
): Promise<Buffer> {
  if (frames.length === 0) {
    throw new Error("A centered vertical sprite sheet requires at least one frame")
  }

  const decoded = await settleAll(
    frames.map((frame, index) =>
      invokeAsPromise(async () => {
        try {
          const result = await dependencies.decode(frame.image, index)
          assertDecodedFrame(result, frame.label)
          return result
        } catch (cause) {
          throw new Error(`Could not decode sprite sheet frame ${index} (${frame.label})`, {
            cause,
          })
        }
      }),
    ),
  )
  const cellWidth = Math.max(...decoded.map((frame) => frame.width))
  const cellHeight = Math.max(...decoded.map((frame) => frame.height))

  try {
    return await sharp({
      create: {
        width: cellWidth,
        height: cellHeight * decoded.length,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(
        decoded.map((frame, index) => ({
          input: frame.data,
          raw: { width: frame.width, height: frame.height, channels: 4 },
          left: Math.floor((cellWidth - frame.width) / 2),
          top: index * cellHeight + Math.floor((cellHeight - frame.height) / 2),
        })),
      )
      .png()
      .toBuffer()
  } catch (cause) {
    throw new Error("Could not compose centered vertical sprite sheet", { cause })
  }
}

function assertDecodedFrame(frame: DecodedSpriteSheetFrame, label: string): void {
  if (
    !Number.isInteger(frame.width) ||
    frame.width <= 0 ||
    !Number.isInteger(frame.height) ||
    frame.height <= 0 ||
    frame.data.length !== frame.width * frame.height * 4
  ) {
    throw new Error(`Invalid decoded RGBA sprite sheet frame (${label})`)
  }
}
