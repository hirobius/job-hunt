// Tiny browser download helper — hands text or bytes to the user as a file via a temporary blob link.
// The object URL is revoked a beat later: revoking synchronously can cancel the download.
export function download(
  filename: string,
  data: string | Uint8Array<ArrayBuffer>,
  mime = 'text/plain',
): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
