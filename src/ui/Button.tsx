// The Button seam for the MUI→HDS migration (adr/0004). Re-exports the real HDS Button and
// accepts BOTH HDS variant names (primary/secondary/tertiary) and the MUI ones
// (contained/outlined/text) + MUI sizes + startIcon/endIcon, so call sites migrate by changing
// the import, not the props. When MUI is gone, this can collapse to a plain re-export.
import { forwardRef, type ReactNode } from 'react';
import { Button as HdsButton, type ButtonProps as HdsButtonProps } from '@hirobius/design-system';

type HdsVariant = NonNullable<HdsButtonProps['variant']>;
type HdsSize = NonNullable<HdsButtonProps['size']>;

const VARIANT: Record<string, HdsVariant> = {
  contained: 'primary',
  outlined: 'secondary',
  text: 'tertiary',
};
const SIZE: Record<string, HdsSize> = { small: 'sm', medium: 'md', large: 'lg' };

export interface ButtonProps
  extends Omit<HdsButtonProps, 'variant' | 'size' | 'iconLeft' | 'iconRight'> {
  variant?: HdsVariant | 'contained' | 'outlined' | 'text';
  size?: HdsSize | 'small' | 'medium' | 'large';
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', startIcon, endIcon, ...props },
  ref,
) {
  return (
    <HdsButton
      ref={ref}
      variant={VARIANT[variant] ?? (variant as HdsVariant)}
      size={SIZE[size] ?? (size as HdsSize)}
      iconLeft={startIcon}
      iconRight={endIcon}
      {...props}
    />
  );
});
