import type { FileContentExpectation } from "./file-content-expectation.ts"
import type { OutputBuilder } from "./output-publisher.ts"

export const outputTargetPolicies = ["must-not-exist", "replace-existing"] as const

export type OutputTargetPolicy = (typeof outputTargetPolicies)[number]

interface OutputTargetBase {
  readonly targetPath: string
  readonly allowedRoot: string
  readonly policy: OutputTargetPolicy
}

export interface OutputDirectoryTarget extends OutputTargetBase {
  readonly kind: "directory"
  readonly build: OutputBuilder
}

export interface OutputFileTarget extends OutputTargetBase {
  readonly kind: "file"
  readonly expectedContent?: FileContentExpectation
  readonly build: (stagingFile: string) => Promise<void>
}

export type OutputSetTarget = OutputDirectoryTarget | OutputFileTarget

export interface OutputSetPublisher {
  publish(targets: readonly OutputSetTarget[]): Promise<void>
}
