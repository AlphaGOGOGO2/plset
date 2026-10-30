// Saves a UTF-8 text file: the desktop app's save dialog when it is available, otherwise a browser download.
// Resolves 'saved' or 'downloaded', or null when the save dialog was cancelled.
export async function saveText(name: string, text: string): Promise<'saved' | 'downloaded' | null> {
  if (window.plset?.exportText) return await window.plset.exportText(name, text) ? 'saved' : null;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  return 'downloaded';
}
