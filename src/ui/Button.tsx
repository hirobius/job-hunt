// The Button seam for the MUI→HDS migration (adr/0004, adr/0005). Renders the real HDS
// Button while accepting BOTH prop dialects — HDS (primary/secondary/tertiary, sm/md/lg,
// tone) and MUI (contained/outlined/text, small/medium/large, color, startIcon/endIcon,
// href) — so call sites migrate by changing the import, not the markup. MUI's implicit
// default (no variant = text) is preserved. When MUI is gone this collapses to a plain
// re-export.
import { forwardRef, type ReactNode } from 'react';
import { Button as HdsButton, type ButtonProps as HdsButtonProps } from '@hirobius/design-system';

type HdsVariant = NonNullable<HdsButtonProps['variant']>;
type HdsSize = NonNullable<HdsButtonProps['size']>;
type HdsTone = NonNullable<HdsButtonProps['tone']>;

const VARIANT: Record<string, HdsVariant> = {
  contained: 'primary',
  outlined: 'secondary',
  text: 'tertiary',
};
const SIZE: Record<string, HdsSize> = { small: 'sm', medium: 'md', large: 'lg' };
// MUI color → HDS tone. primary/inherit mean "brand/default" — HDS's neutral chrome.
const TONE: Record<string, HdsTone> = {
  error: 'danger',
  success: 'success',
  warning: 'warning',
  info: 'info',
  primary: 'neutral',
  secondary: 'neutral',
  inherit: 'neutral',
};

export interface ButtonProps
  extends Omit<HdsButtonProps, 'variant' | 'size' | 'iconLeft' | 'iconRight'> {
  variant?: HdsVariant | 'contained' | 'outlined' | 'text';
  size?: HdsSize | 'small' | 'medium' | 'large';
  /** MUI color dialect; mapped onto HDS `tone` (explicit `tone` wins). */
  color?: keyof typeof TONE;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  /** Link mode: renders the HDS button chrome on an <a> via asChild. */
  href?: string;
  target?: string;
  rel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'text', size = 'md', color, tone, startIcon, endIcon, href, target, rel, children, ...props },
  ref,
) {
  const shared = {
    ref,
    variant: VARIANT[variant] ?? (variant as HdsVariant),
    size: SIZE[size] ?? (size as HdsSize),
    tone: tone ?? (color ? TONE[color] : undefined),
    iconLeft: startIcon,
    iconRight: endIcon,
  };
  if (href)
    return (
      <HdsButton {...shared} asChild {...props}>
        <a href={href} target={target} rel={rel}>
          {children}
        </a>
      </HdsButton>
    );
  return (
    <HdsButton {...shared} {...props}>
      {children}
    </HdsButton>
  );
});
