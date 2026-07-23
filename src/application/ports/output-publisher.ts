export type OutputBuilder = (workspace: string) => Promise<void>

export interface OutputPublisher {
  publish(targetDirectory: string, build: OutputBuilder): Promise<void>
}
