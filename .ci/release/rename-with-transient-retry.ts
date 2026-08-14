export type RenamePath = (source: string, destination: string) => Promise<void>
export type Delay = (milliseconds: number) => Promise<void>

export async function renameWithTransientRetry(
  source: string,
  destination: string,
  renamePath: RenamePath,
  delay: Delay,
): Promise<void> {
  const delays = [50, 100, 200, 400]
  for (let attempt = 0; ; attempt += 1) {
    try {
      await renamePath(source, destination)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const retryDelay = delays[attempt]
      if ((code !== "EPERM" && code !== "EBUSY") || retryDelay === undefined) throw error
      await delay(retryDelay)
    }
  }
}
