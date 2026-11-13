// The app bar's theme switch (#688): HDS ThemeToggle (its own name, "Switch to dark theme" /
// "Switch to light theme", and no aria-pressed, by HDS's contract) driven by ColorMode. The burn
// starts where it was pressed; from the keyboard, at the button's centre.
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ThemeToggle } from '@hirobius/design-system';
import { useColorMode } from '../ColorMode';

export default function ThemeBurnToggle() {
  const { mode, burnToggle } = useColorMode();
  const button = useRef<HTMLButtonElement>(null);
  const at = useRef<{ x: number; y: number } | null>(null);
  // The icon flips on the tap itself, before the burn's snapshot, so its morph starts at once at
  // HDS's own duration (#695); it follows the mode otherwise (another tab, the OS).
  const [shownDark, setShownDark] = useState(mode === 'dark');
  const [seen, setSeen] = useState(mode);
  if (seen !== mode) {
    setSeen(mode);
    setShownDark(mode === 'dark');
  }
  return (
    <ThemeToggle
      ref={button}
      className="rjb-theme-toggle"
      isDark={shownDark}
      onPointerDown={(e) => {
        at.current = { x: e.clientX, y: e.clientY };
      }}
      onKeyDown={() => {
        at.current = null;
      }}
      onToggle={() => {
        flushSync(() => setShownDark(mode !== 'dark'));
        const b = button.current?.getBoundingClientRect();
        const took = burnToggle(
          at.current ??
            (b
              ? { x: b.left + b.width / 2, y: b.top + b.height / 2 }
              : { x: innerWidth / 2, y: 0 }),
        );
        at.current = null;
        // A tap during a burn is ignored: put the icon back.
        if (!took) setShownDark(mode === 'dark');
      }}
    />
  );
}
