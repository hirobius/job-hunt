# Auth email templates (#278)

Supabase Auth settings for this project are dashboard-only (there is no
`supabase/config.toml`: a `supabase config push` would also push every default
in it, for example Site URL and redirect URLs). These files are the source of
truth for the text. Paste them by hand.

| Dashboard field                                           | Value                              |
| --------------------------------------------------------- | ---------------------------------- |
| Authentication > Emails > Templates > Magic link: Subject | `Your Roleflame sign-in link`      |
| Authentication > Emails > Templates > Magic link: Body    | the full text of `magic_link.html` |

The app signs in with a magic link only (`signInWithOtp`), so only the Magic
link template is in use. Keep `{{ .ConfirmationURL }}` as the link target: the
app reads the session from the URL fragment it returns to
(`src/authFragment.ts`). `src/authEmailTemplate.test.ts` pins the template.

If the product name changes (`src/brand.ts`), the test fails until this
template and the subject above use the new name. Then paste both again.
