// A restore writes every store, and every store swallows a full or blocked localStorage
// (persisted.ts), so a big restore could look done and be gone on reload (#339). This watches
// Storage.setItem while each store is written and names the ones whose write threw.

/** Run each step; return the labels of the steps whose storage write failed. */
export function writesThatFailed(steps: [label: string, write: () => void][]): string[] {
  const proto = Storage.prototype;
  const original = proto.setItem;
  let threw: boolean;
  proto.setItem = function (this: Storage, key: string, value: string) {
    try {
      original.call(this, key, value);
    } catch (e) {
      threw = true;
      throw e;
    }
  };
  const failed: string[] = [];
  try {
    for (const [label, write] of steps) {
      threw = false;
      write();
      if (threw && !failed.includes(label)) failed.push(label);
    }
  } finally {
    proto.setItem = original;
  }
  return failed;
}

/** "jobs", "jobs and documents", "jobs, documents and tracks". */
export function listWords(words: string[]): string {
  return words.length < 2
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
