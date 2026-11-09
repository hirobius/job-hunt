// The sign-in screen's shared layout (sign-in layout PR, 2026-11-08): a full-screen HDS Dialog
// panel with the animated flame and wordmark at one fixed place on top, the same on every step
// (the form, "Check your email", a link's "Sign in as …?"), and the step's content under it. The
// brand sits in normal flow above the steps and is never re-mounted as they change, so it never
// moves; its embers float above it without taking room (overflow visible).
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { Button, Dialog, Icon } from '@hirobius/design-system';
import { Pause, Play } from 'lucide-react';
import { RoleFlameLogo, useMotionPaused } from '../brand/RoleFlame';
import { setMotionPaused } from '../motionPref';
import { useVisualViewportVars } from '../hds-gaps/useVisualViewportVars';
import './SignInDialog.css';

type ContentProps = Omit<ComponentProps<typeof Dialog.Content>, 'className' | 'hideClose'>;

/** The animated logo, stacked: the flame above the name. Not a heading: each step has its title. */
export const SignInBrand = forwardRef<HTMLDivElement>(function SignInBrand(_props, ref) {
  return (
    <div className="rjb-signin-screen__brand" ref={ref}>
      <RoleFlameLogo layout="stacked" fontSize={40} />
    </div>
  );
});

export function SignInShell({
  children,
  brandRef,
  ...content
}: ContentProps & { children: ReactNode; brandRef?: React.Ref<HTMLDivElement> }) {
  const viewportRef = useVisualViewportVars<HTMLDivElement>();
  // The flame burns on (Adrian 2026-11-09), so the screen has its own Pause / Play (WCAG 2.2.2,
  // #519 review): the same per-device choice as the Account menu's item (motionPref.ts). After the
  // step in the DOM (focus starts on the step's field), at the top right on screen.
  const paused = useMotionPaused();
  return (
    <Dialog.Content ref={viewportRef} className="rjb-signin-screen" hideClose {...content}>
      <div className="rjb-signin-screen__column" data-paused={paused || undefined}>
        <SignInBrand ref={brandRef} />
        <div className="rjb-signin-screen__step">{children}</div>
      </div>
      <div className="rjb-signin-screen__motion">
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={paused ? Play : Pause} />}
          label={paused ? 'Play animations' : 'Pause animations'}
          onClick={() => setMotionPaused(!paused)}
        />
      </div>
    </Dialog.Content>
  );
}
