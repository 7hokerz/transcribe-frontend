import 'server-only';

const isDevelopment = process.env.NODE_ENV === 'development';

export async function logger(message: string, error: unknown): Promise<void> {
    if(isDevelopment) {
        console.error(message, error);
    } 
}