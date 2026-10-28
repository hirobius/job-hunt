// The sign-in dialog, mounted from its first open on (#371): most visits never sign in, so its
// code is its own chunk. Once mounted it stays, so a sent link's "Check your email" state
// survives closing and reopening.
import { Suspense, useState } from 'react';
import { SignInDialog } from '../lazyDialogs';
import { useCloudSync } from './accountContext';

export default function SignInHost() {
  const { signInOpen } = useCloudSync();
  const [opened, setOpened] = useState(signInOpen);
  if (signInOpen && !opened) setOpened(true);
  if (!opened) return null;
  return (
    <Suspense fallback={null}>
      <SignInDialog />
    </Suspense>
  );
}
