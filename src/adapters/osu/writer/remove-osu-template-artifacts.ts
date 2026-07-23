import { rm } from "node:fs/promises"
import path from "node:path"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"

const internalOsuTemplateArtifacts = ["receptor-base.png", "LNB.png", "LNT.png"] as const

type ArtifactRemover = (artifactPath: string) => Promise<void>

export interface RemoveOsuTemplateArtifactsOptions {
  removeArtifact?: ArtifactRemover
}

export async function removeOsuTemplateArtifacts(
  outputDirectory: string,
  options: RemoveOsuTemplateArtifactsOptions = {},
): Promise<void> {
  const removeArtifact = options.removeArtifact ?? rm
  await settleAll(
    internalOsuTemplateArtifacts.map((filename) =>
      removeArtifact(path.join(outputDirectory, filename)),
    ),
  )
}
