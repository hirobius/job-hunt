// Magic-link sign-in (#115 Phase 1), opened from the account menu or the sync nudge. Replaces
// the email form that sat in a banner on every page.
import { useState } from 'react';
import { Button, Dialog, Input, Stack, Text } from '@hirobius/design-system';
import { useCloudSync } from './accountContext';

const secondary = { color: 'var(--semantic-color-content-secondary)' };

export default function SignInDialog() {
  const { signInOpen, setSignInOpen, sendLink } = useCloudSync();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const e = email.trim();
    if (!e || sending) return;
    setSending(true);
    const err = await sendLink(e);
    setSending(false);
    if (!err) setSentTo(e);
  };

  const onOpenChange = (open: boolean) => {
    setSignInOpen(open);
    if (!open) setSentTo(null);
  };

  return (
    <Dialog open={signInOpen} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ width: '100%', maxWidth: 440 }}>
        <Dialog.Header>
          <Dialog.Title>Sign in to sync</Dialog.Title>
          <Dialog.Description>
            We'll email you a sign-in link. Your data stays in your browser and your own account —
            nothing is shared with anyone else.
          </Dialog.Description>
        </Dialog.Header>
        {sentTo ? (
          <Text variant="body" role="status">
            Check {sentTo} for your sign-in link.
          </Text>
        ) : (
          <Stack gap="tight">
            <Input
              type="email"
              label="Email"
              placeholder="you@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send();
              }}
            />
            <Text variant="caption" as="p" style={secondary}>
              Signing in syncs jobs, templates and tracks across your devices.
            </Text>
          </Stack>
        )}
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="secondary">{sentTo ? 'Done' : 'Cancel'}</Button>
          </Dialog.Close>
          {!sentTo && (
            <Button onClick={() => void send()} disabled={!email.trim() || sending}>
              {sending ? 'Sending…' : 'Email me a link'}
            </Button>
          )}
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
