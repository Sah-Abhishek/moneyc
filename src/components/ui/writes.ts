// Every write in flight, app-wide, so one indicator can say "saving" whatever
// started it: a form, a button, an Undo in a toast.

let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function trackWrite<T>(run: () => Promise<T>): Promise<T> {
  count++;
  emit();
  try {
    return await run();
  } finally {
    count--;
    emit();
  }
}

export const writesInFlight = () => count;

export function subscribeWrites(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
