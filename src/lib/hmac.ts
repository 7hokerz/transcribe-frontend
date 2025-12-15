import crypto from 'crypto';

export function generateHMACSignature(
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp: string,
  nonce: string
): string {
  const message = `${method.toUpperCase()}${path}${body}${timestamp}${nonce}`;

  return crypto
    .createHmac('sha256', secret)
    .update(message, 'utf8')
    .digest('hex');
}