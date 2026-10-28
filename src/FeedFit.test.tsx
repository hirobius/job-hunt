import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceEditor } from './FeedFit';
import { EVIDENCE_MAX } from './radar/evidenceStore';

describe('EvidenceEditor size note', () => {
  it('shows a visible note only at the cap', async () => {
    const { rerender } = render(<EvidenceEditor text="short" count={1} onChange={() => {}} />);
    const field = screen.getByRole('textbox', { name: 'Your evidence' });
    expect(field).toHaveAttribute('rows', '5');
    // HDS Textarea resize (was the local .rjb-resize patch): the user can make it taller.
    expect(field).toHaveClass('resize-y');
    expect(screen.queryByText(/character limit/)).toBeNull();
    rerender(<EvidenceEditor text={'x'.repeat(EVIDENCE_MAX)} count={1} onChange={() => {}} />);
    expect(screen.getByText(/20,000 character limit/)).toBeInTheDocument();
  });
});
