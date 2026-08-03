export function invokeAsPromise<T>(task: () => T | PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve) => resolve(task()))
}

export async function settleAll<const Values extends readonly unknown[]>(
  tasks: readonly [...{ [Index in keyof Values]: Promise<Values[Index]> }],
): Promise<Values>
export async function settleAll<T>(tasks: readonly Promise<T>[]): Promise<T[]>
export async function settleAll(tasks: readonly Promise<unknown>[]): Promise<unknown[]> {
  const results = await Promise.allSettled(tasks)

  for (const result of results) {
    if (result.status === "rejected") {
      throw result.reason
    }
  }

  return results.map((result) => {
    if (result.status === "rejected") {
      throw result.reason
    }
    return result.value
  })
}
