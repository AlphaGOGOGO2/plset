// Saves a UTF-8 text file as a browser download.
// Resolves with the save method (kept as a result type for callers).
export async function saveText(name: string, text: string): Promise<'saved' | 'downloaded' | null> {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  return 'downloaded';
}
