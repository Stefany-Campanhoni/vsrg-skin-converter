import type { ImageDimensions } from "../../../application/ports/image-operations.ts"
import type { ImageAsset } from "../../../domain/image.ts"
import {
  type JudgementGrade,
  type JudgementSet,
  judgementGrades,
} from "../../../domain/judgement.ts"
import {
  sourceBasename,
  sourceExtname,
} from "../../../infrastructure/filesystem/source-relative-path.ts"
import { parseEtternaImageMetadata } from "../image/parse-etterna-image-metadata.ts"

const rowsByGrade: Record<JudgementGrade, number> = {
  marvelous: 0,
  perfect: 1,
  great: 2,
  good: 3,
  bad: 4,
  miss: 5,
}

export async function analyzeEtternaJudgementSheetUsing(
  filePath: string,
  readDimensions: (path: string) => Promise<Partial<ImageDimensions>>,
): Promise<JudgementSet> {
  const { columns, rows, doubleResolution } = parseEtternaImageMetadata(
    sourceBasename(filePath).slice(0, -sourceExtname(filePath).length),
  )

  if (rows !== 6 || (columns !== 1 && columns !== 2)) {
    throw new Error(
      `Expected 1x6 or 2x6 Etterna judgement layout, received ${columns}x${rows}: ${filePath}`,
    )
  }

  const { width, height } = await readDimensions(filePath)
  if (width === undefined || height === undefined || width % columns !== 0 || height % rows !== 0) {
    throw new Error(
      `Judgement sheet dimensions must be divisible by the declared ${columns}x${rows} layout: ${filePath}`,
    )
  }

  const images = Object.fromEntries(
    judgementGrades.map((grade) => [
      grade,
      {
        filePath,
        rotation: 0,
        frame: {
          index: rowsByGrade[grade] * columns,
          columns,
          rows,
        },
      },
    ]),
  ) as Record<JudgementGrade, ImageAsset>

  return {
    sourceDensity: doubleResolution ? 2 : 1,
    images,
  }
}
