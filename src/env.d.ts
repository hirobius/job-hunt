// The build-time values the client reads (Vite inlines `VITE_*` only). Kept narrow on purpose:
// `vite/client` is not in the types, so each value the app reads is named here.
interface ImportMetaEnv {
  /** hCaptcha's PUBLIC site key (#278). Unset or empty: no CAPTCHA, as before. Never the secret. */
  readonly VITE_HCAPTCHA_SITEKEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
