import 'server-only';
import { cookies } from 'next/headers';
import { generateCsrfToken } from './jwt';

export async function setTokensInCookies(): Promise<void> {
  const cookieStore = await cookies();
  const csrfToken = await generateCsrfToken();

  cookieStore.set('XSRF-TOKEN', csrfToken, {
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'strict',
    maxAge: 15 * 60
  });
}

export async function getCsrfToken(): Promise<string | null> {
  return (await cookies()).get('XSRF-TOKEN')?.value || null;
}

export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();
  const cookiesToDelete = ['XSRF-TOKEN'];

  cookiesToDelete.forEach(cookieName => {
    cookieStore.set(cookieName, '', {
      expires: new Date(0),
      maxAge: 0,
      path: '/'
    });
  });
}

