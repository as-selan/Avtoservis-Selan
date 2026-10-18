export const REALTIME_TABLES = [
  'service_requests', 'service_case_assignments', 'service_case_notes',
  'service_case_photos', 'service_case_reviews',
] as const;

/** Coalesce a transaction's events and defer refresh while an operator is typing. */
export function createRefreshScheduler(options: {
  refresh: () => void; canRefresh: () => boolean;
  schedule: (callback: () => void, delay: number) => number;
  cancel: (id: number) => void;
}) {
  let pending = false;
  let disposed = false;
  let timer: number | undefined;
  const flush = () => {
    timer = undefined;
    if (disposed || !pending || !options.canRefresh()) return;
    pending = false;
    options.refresh();
  };
  const resume = () => {
    if (!disposed && pending && timer === undefined) timer = options.schedule(flush, 350);
  };
  return {
    changed() { pending = true; resume(); },
    resume,
    dispose() { disposed = true; if (timer !== undefined) options.cancel(timer); },
  };
}
