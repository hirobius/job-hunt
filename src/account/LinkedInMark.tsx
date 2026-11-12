// LinkedIn's "in" bug for "Continue with LinkedIn". LinkedIn's brand guidelines: the bug as given, in
// LinkedIn blue (#0A66C2) with a white "in", never recoloured, resized only as a whole. So, like
// Google's G, it is a third-party drawing allowed by name in brand/flame.test.tsx and keeps its own
// fills instead of HDS tokens. Decorative: the button's label names the action.
import linkedinIn from './linkedin-in.svg?raw';

export function LinkedInMark() {
  return (
    <span
      className="rjb-google-mark rjb-linkedin-mark"
      aria-hidden="true"
      // The repo's own static file (a build-time import), never user content.
      dangerouslySetInnerHTML={{ __html: linkedinIn.trim() }}
    />
  );
}
