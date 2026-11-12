// Prototype (proto/theme-burn): a temporary app-bar trigger for the burn theme switch. HDS ThemeToggle
// (sun-to-moon morph) driven by ColorMode; the burn starts where it was pressed.
import { useRef } from 'react';
import { ThemeToggle } from '@hirobius/design-system';
import { useColorMode } from '../ColorMode';

export default function ThemeBurnToggle() {
  const { mode, burnToggle } = useColorMode();
  const at = useRef<{ x: number; y: number } | null>(null);
  return (
    <ThemeToggle
      isDark={mode === 'dark'}
      onPointerDown={(e) => {
        at.current = { x: e.clientX, y: e.clientY };
      }}
      onToggle={() => {
        const b = document.activeElement?.getBoundingClientRect();
        burnToggle(at.current ?? { x: b ? b.left + b.width / 2 : innerWidth / 2, y: b ? b.top + b.height / 2 : 0 });
        at.current = null;
      }}
    />
  );
}
