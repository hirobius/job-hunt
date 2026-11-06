// Google's "G" mark for "Continue with Google" (#482). Google's sign-in branding rules: the
// standard mark in its own four colours, never recoloured, resized only as a whole. So it is the
// one third-party drawing in the repo (google-g.svg, allowed by name in brand/flame.test.tsx) and
// it keeps its own fills instead of HDS tokens. Decorative: the button's label names the action.
import googleG from './google-g.svg?raw';

export function GoogleMark() {
  return (
    <span
      className="rjb-google-mark"
      aria-hidden="true"
      // The repo's own static file (a build-time import), never user content.
      dangerouslySetInnerHTML={{ __html: googleG.trim() }}
    />
  );
}
