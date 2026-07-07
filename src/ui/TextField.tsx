// TextField adapter — maps MUI's `TextField` (label / helperText / multiline / fullWidth /
// sx) onto HDS Input + Textarea so the AI dialogs migrate by import swap (issue #11).
// Single-line → HDS Input, multiline → HDS Textarea. No `select` support (unused; the one
// dropdown, PillarsDialog's seniority, moved to SegmentedControl).
import { forwardRef } from 'react';
import { Input, Textarea } from '@hirobius/design-system';
import { Box, type Sx } from './box';

export interface TextFieldProps {
  label?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  helperText?: string;
  multiline?: boolean;
  minRows?: number;
  rows?: number;
  fullWidth?: boolean;
  autoFocus?: boolean;
  size?: 'small' | 'medium';
  sx?: Sx;
}

export const TextField = forwardRef<HTMLElement, TextFieldProps>(function TextField(
  { multiline, minRows, rows, fullWidth = true, size, sx, ...rest },
  ref,
) {
  void size;
  const wrapSx: Sx = { minWidth: 0, '& > *': { width: '100%' }, ...(fullWidth ? { width: '100%' } : {}), ...sx };
  if (multiline)
    return (
      <Box sx={wrapSx}>
        <Textarea ref={ref as never} rows={minRows ?? rows ?? 3} style={{ width: '100%' }} {...rest} />
      </Box>
    );
  return (
    <Box sx={wrapSx}>
      <Input ref={ref as never} size="sm" style={{ width: '100%' }} {...rest} />
    </Box>
  );
});
