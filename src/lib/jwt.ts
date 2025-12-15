import 'server-only';

export async function generateCsrfToken(): Promise<string> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
}