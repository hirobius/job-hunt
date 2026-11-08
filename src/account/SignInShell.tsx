// The sign-in screen's shared layout (sign-in layout PR, 2026-11-08): a full-screen HDS Dialog
// panel with the animated flame and wordmark at one fixed place on top, the same on every step
// (the form, "Check your email", a link's "Sign in as …?"), and the step's content under it. The
// brand sits in normal flow above the steps and is never re-mounted as they change, so it never
// moves; its embers float above it without taking room (overflow visible).
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { Dialog } from '@hirobius/design-system';
import { RoleFlameLogo } from '../brand/RoleFlame';
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
  return (
    <Dialog.Content ref={viewportRef} className="rjb-signin-screen" hideClose {...content}>
      <div className="rjb-signin-screen__column">
        <SignInBrand ref={brandRef} />
        <div className="rjb-signin-screen__step">{children}</div>
      </div>
    </Dialog.Content>
  );
}
