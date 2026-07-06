type Task<T> = () => Promise<T>

export async function parallel<T>(
  tasks: Task<T>[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = []
  const errors: unknown[] = []
  const executing = new Set<Promise<void>>()

  for (const task of tasks) {
    const p = task()
      .then((result) => {
        results.push(result)
      })
      .catch((err) => {
        errors.push(err)
      })

    const tracked = p.finally(() => {
      executing.delete(tracked)
    })

    executing.add(tracked)

    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }

  await Promise.allSettled(executing)

  if (errors.length > 0) {
    throw errors.length === 1 ? errors[0] : new AggregateError(errors)
  }

  return results
}
