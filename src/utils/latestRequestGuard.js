export function createLatestRequestGuard() {
  let generation = 0;

  return {
    async run(request, { onSuccess, onError, onSettled } = {}) {
      const currentGeneration = ++generation;
      try {
        const value = await request();
        if (currentGeneration !== generation) return { status: "stale" };
        onSuccess?.(value);
        return { status: "success", value };
      } catch (error) {
        if (currentGeneration !== generation) return { status: "stale" };
        onError?.(error);
        return { status: "error", error };
      } finally {
        if (currentGeneration === generation) onSettled?.();
      }
    },
    invalidate() {
      generation += 1;
    },
  };
}
