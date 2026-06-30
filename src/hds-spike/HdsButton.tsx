// HDS spike — an HDS-style Button on HDS's actual public stack: Tailwind v4 + Radix Slot + CVA.
// It is driven entirely by the COMMITTED HDS token layer (src/tokens/hds-tokens.css +
// brand-jade.css, already loaded globally in main.tsx) — the same tokens that feed the MUI
// theme. So this proves the end-state of docs/adr/0001 Path C: one token source, an HDS-shaped
// component rendering inside the MUI app.
//
// NOTE: this is a faithful stand-in, not the private @hirobius/design-system `Button` — see
// docs/adr/0003: shipping the real package would make the Vercel build depend on the private
// registry + NODE_AUTH_TOKEN, which adr/0001 forbids. The Tailwind+Radix+CVA mechanics, and the
// token wiring, are identical to what real adoption looks like.
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

const button = cva(
  [
    'inline-flex items-center justify-center font-semibold whitespace-nowrap',
    'cursor-pointer transition-[background-color,opacity] select-none',
    'rounded-[var(--component-button-radius)]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--semantic-color-surface-accent)]',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--semantic-color-surface-accent)] text-[var(--semantic-color-content-onAccent)] hover:opacity-90',
        secondary:
          'bg-[var(--component-button-secondary-bg-rest)] text-[var(--component-button-secondary-text)] border border-[var(--component-button-secondary-border-rest)] hover:bg-[var(--component-button-secondary-bg-hover)]',
      },
      size: {
        sm: 'h-[var(--component-button-size-sm-height)] px-[var(--component-button-size-sm-paddingX)] text-[length:var(--component-button-size-sm-fontSize)]',
        md: 'h-[var(--component-button-size-md-height)] px-[var(--component-button-size-md-paddingX)] text-[length:var(--component-button-size-md-fontSize)]',
        lg: 'h-[var(--component-button-size-lg-height)] px-[var(--component-button-size-lg-paddingX)] text-[length:var(--component-button-size-lg-fontSize)]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface HdsButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Render as the child element (Radix Slot) — e.g. an <a> styled as a button. */
  asChild?: boolean;
}

export const HdsButton = forwardRef<HTMLButtonElement, HdsButtonProps>(function HdsButton(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} className={[button({ variant, size }), className].filter(Boolean).join(' ')} {...props} />
  );
});
