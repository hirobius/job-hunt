// Draft with AI in the Documents editor (#232, ADR 0009), with the server stubbed: hidden until
// the server says it is set up; every draft is a new Version (unsaved edits saved first, a Sent
// Version never touched); each named error shows in the editor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import DocumentEditor from './DocumentEditor';
import {
  createDocument,
  getAllDocuments,
  markSent,
  replaceDocuments,
  useDocuments,
} from './documents';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';
import { DRAFT_ERRORS, type DraftErrorCode } from './aiDraft/contract';

const api = vi.hoisted(() => ({
  configured: true,
  requestDraft: vi.fn(),
}));
vi.mock('./aiDraft/client', () => ({
  draftConfigured: () => Promise.resolve(api.configured),
  requestDraft: api.requestDraft,
  resetDraftStatus: () => {},
}));

const setSignInOpen = vi.fn();
function Editor({ id, onCreated = () => {} }: { id?: string; onCreated?: (id: string) => void }) {
  const doc = useDocuments().find((d) => d.id === id);
  return (
    <DocumentEditor doc={doc} kind={doc?.kind ?? 'cover'} onBack={() => {}} onCreated={onCreated} />
  );
}
const renderEditor = (id?: string, signedIn = true, onCreated?: (id: string) => void) =>
  render(
    <CloudSyncContext.Provider
      value={
        {
          settled: true,
          user: signedIn ? { id: 'u' } : null,
          setSignInOpen,
        } as unknown as CloudSyncApi
      }
    >
      <ToastProvider>
        <Editor id={id} onCreated={onCreated} />
      </ToastProvider>
    </CloudSyncContext.Provider>,
  );
const texts = (id: string) =>
  getAllDocuments()
    .find((d) => d.id === id)!
    .versions.map((v) => v.text);
const openDraft = async () =>
  userEvent.click(await screen.findByRole('button', { name: 'Draft with AI' }));

afterEach(cleanup);
beforeEach(() => {
  replaceDocuments([]);
  api.configured = true;
  api.requestDraft.mockReset();
  setSignInOpen.mockReset();
});

describe('Draft with AI', () => {
  it('is hidden when the server is not set up (ships dark)', async () => {
    api.configured = false;
    const id = createDocument({ kind: 'cover', title: 'Acme', text: 'Hi', base: true });
    renderEditor(id);
    await screen.findByRole('textbox', { name: 'Text' });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: 'Draft with AI' })).toBeNull();
  });

  it('rewrites the text and saves the answer as a new Version', async () => {
    const id = createDocument({ kind: 'cover', title: 'Acme', text: 'Old letter', base: true });
    api.requestDraft.mockResolvedValue({ ok: true, text: 'New letter' });
    renderEditor(id);
    await openDraft();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'How should it change? (optional)' }),
      'Warmer',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Rewrite' }));
    await waitFor(() => expect(texts(id)).toEqual(['Old letter', 'New letter']));
    expect(api.requestDraft).toHaveBeenCalledWith({
      kind: 'cover',
      mode: 'rewrite',
      text: 'Old letter',
      instruction: 'Warmer',
      title: 'Acme',
    });
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('New letter');
    expect(await screen.findByText('Drafted as version 2')).toBeInTheDocument();
  });

  it('saves unsaved edits as their own Version first, so nothing typed is lost', async () => {
    const id = createDocument({ kind: 'note', title: 'N', text: 'v1', base: true });
    api.requestDraft.mockResolvedValue({ ok: true, text: 'AI text' });
    renderEditor(id);
    const box = await screen.findByRole('textbox', { name: 'Text' });
    await userEvent.type(box, ' edited');
    await openDraft();
    await userEvent.click(screen.getByRole('button', { name: 'Rewrite' }));
    await waitFor(() => expect(texts(id)).toEqual(['v1', 'v1 edited', 'AI text']));
  });

  it('never edits a Sent Version: the draft is added after it', async () => {
    const id = createDocument({
      kind: 'cover',
      title: 'Sent one',
      text: 'As sent',
      jobUrl: 'https://acme.example/j/1',
    });
    const sent = getAllDocuments().find((d) => d.id === id)!.versions[0];
    expect(markSent(id, sent.id)).toBe('sent');
    api.requestDraft.mockResolvedValue({ ok: true, text: 'Follow-on' });
    renderEditor(id);
    await openDraft();
    await userEvent.click(screen.getByRole('button', { name: 'Rewrite' }));
    await waitFor(() => expect(texts(id)).toEqual(['As sent', 'Follow-on']));
    const v = getAllDocuments().find((d) => d.id === id)!.versions;
    expect(v[0]).toEqual(
      expect.objectContaining({ id: sent.id, text: 'As sent', sentAt: expect.any(String) }),
    );
    expect(v[1].sentAt).toBeUndefined();
  });

  it('a first draft on a new document creates it with the draft as its Version', async () => {
    api.requestDraft.mockResolvedValue({ ok: true, text: 'Fresh letter' });
    const created = vi.fn();
    renderEditor(undefined, true, created);
    await openDraft();
    const go = screen.getByRole('button', { name: 'Draft' });
    expect(go).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'What should it say?' }),
      'Letter for Acme',
    );
    await userEvent.click(go);
    await waitFor(() => expect(created).toHaveBeenCalled());
    const id = created.mock.calls[0][0] as string;
    expect(texts(id)).toEqual(['Fresh letter']);
    expect(api.requestDraft).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'draft', text: '', instruction: 'Letter for Acme' }),
    );
  });

  it.each(Object.entries(DRAFT_ERRORS) as [DraftErrorCode, string][])(
    'shows the named error %s and saves nothing',
    async (code, message) => {
      const id = createDocument({ kind: 'cover', title: 'Acme', text: 'Old', base: true });
      api.requestDraft.mockResolvedValue({ ok: false, code, message });
      renderEditor(id, code !== 'not_signed_in');
      await openDraft();
      await userEvent.click(screen.getByRole('button', { name: 'Rewrite' }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(texts(id)).toEqual(['Old']);
    },
  );

  it('signed out, the not-signed-in error offers Sign in', async () => {
    const id = createDocument({ kind: 'cover', title: 'Acme', text: 'Old', base: true });
    api.requestDraft.mockResolvedValue({
      ok: false,
      code: 'not_signed_in',
      message: DRAFT_ERRORS.not_signed_in,
    });
    renderEditor(id, false);
    await openDraft();
    await userEvent.click(screen.getByRole('button', { name: 'Rewrite' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(setSignInOpen).toHaveBeenCalledWith(true);
  });
});
