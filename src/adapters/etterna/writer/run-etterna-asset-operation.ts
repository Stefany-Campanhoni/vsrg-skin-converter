import { invokeAsPromise } from "../../../infrastructure/async/settle-all.ts"

export async function runEtternaAssetOperation<T>(
  description: string,
  task: () => T | PromiseLike<T>,
): Promise<T> {
  try {
    return await invokeAsPromise(task)
  } catch (cause) {
    throw new Error(`Could not ${description}`, { cause })
  }
}
