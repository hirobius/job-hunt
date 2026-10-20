// Tiny browser download helper — hands a string (or a Blob, e.g. an uploaded final copy) to the
// user as a file via a temporary blob link.
// The object URL is revoked a beat later: revoking synchronously can cancel the download.
export function download(filename: string, content: string | Blob, mime = 'text/plain'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
