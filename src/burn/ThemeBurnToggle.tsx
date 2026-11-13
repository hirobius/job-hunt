// The app bar's theme switch (#688): HDS ThemeToggle (its own name, "Switch to dark theme" /
// "Switch to light theme", and no aria-pressed, by HDS's contract) driven by ColorMode. The burn
// starts where it was pressed; from the keyboard, at the button's centre.
import { useRef } from 'react';
import { ThemeToggle } from '@hirobius/design-system';
import { useColorMode } from '../ColorMode';

export default function ThemeBurnToggle() {
  const { mode, burnToggle } = useColorMode();
  const button = useRef<HTMLButtonElement>(null);
  const at = useRef<{ x: number; y: number } | null>(null);
  return (
    <ThemeToggle
      ref={button}
      className="rjb-theme-toggle"
      isDark={mode === 'dark'}
      onPointerDown={(e) => {
        at.current = { x: e.clientX, y: e.clientY };
      }}
      onKeyDown={() => {
        at.current = null;
      }}
      onToggle={() => {
        const b = button.current?.getBoundingClientRect();
        burnToggle(
          at.current ??
            (b
              ? { x: b.left + b.width / 2, y: b.top + b.height / 2 }
              : { x: innerWidth / 2, y: 0 }),
        );
        at.current = null;
      }}
    />
  );
}
