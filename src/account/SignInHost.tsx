// The sign-in dialog, mounted from its first open on (#371): most visits never sign in, so its
// code is its own chunk. Once mounted it stays, so a sent link's "Check your email" state
// survives closing and reopening.
import { SignInDialog, useLoadedWhen } from '../lazyDialogs';
import { useCloudSync } from './accountContext';

export default function SignInHost() {
  const { signInOpen, setSignInOpen } = useCloudSync();
  const ready = useLoadedWhen(SignInDialog, signInOpen, () => setSignInOpen(false));
  return ready ? <SignInDialog /> : null;
}
