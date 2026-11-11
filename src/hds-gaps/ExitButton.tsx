// The exit (redesign §3, #537): the one style for every way out (Cancel, Not a fit, Continue
// without an account). HDS `Button variant="link"`: underlined, content.primary, no fill, no
// ledge. HDS's link has no touch minimum at every width, so `hds-touch-target` (HDS's own class)
// gives it the 44px hit area. Never a second choice: that is a grey key (variant="secondary").
// Delete this file when HDS ships an exit with its own target size.
// hds-gap: hirobius/hds#1442 (G11: the exit button)
import { forwardRef, type ComponentProps } from 'react';
import { Button } from '@hirobius/design-system';
import { cn } from '@hirobius/design-system/cn';

type Props = Omit<ComponentProps<typeof Button>, 'variant' | 'tone'>;

export const ExitButton = forwardRef<HTMLButtonElement, Props>(function ExitButton(
  { className, size = 'md', ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant="link"
      size={size}
      className={cn('hds-touch-target', className)}
      data-rjb-exit=""
      {...rest}
    />
  );
});
