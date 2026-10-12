import { rm } from "node:fs/promises"
import path from "node:path"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { internalOsuTemplateArtifacts } from "./osu-template-assets.ts"

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
      invokeAsPromise(() => removeArtifact(path.join(outputDirectory, filename))),
    ),
  )
}
