import { api } from '../api/client';
import { getCached, setCached } from './queue';

export type Category = { id: string; slug: string; name: string; department: string };

/** The server's category list, with the last copy kept on the phone for reporting offline. */
export async function loadCategories(): Promise<Category[]> {
  try {
    const fresh = await api<Category[]>('/categories');
    await setCached('categories', JSON.stringify(fresh));
    return fresh;
  } catch (error) {
    const cached = await getCached('categories');
    if (cached) return JSON.parse(cached);
    throw error;
  }
}
