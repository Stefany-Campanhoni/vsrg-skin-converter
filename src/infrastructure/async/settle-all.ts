export async function settleAll<T>(tasks: readonly Promise<T>[]): Promise<T[]> {
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
