import { useRef, useState } from 'react';

/** Transient "Saved ✓" flash after a field autosaves. */
export function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = () => {
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1200);
  };
  return { saved, flash };
}
