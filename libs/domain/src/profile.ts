import { tasteProfiles, type Database } from '@simmery/db';
import { eq } from 'drizzle-orm';

export interface TasteProfile {
  /** Freeform markdown, stored as given (R21). */
  body: string;
  /** Null until the profile is first written. */
  updatedAt: Date | null;
}

export async function getTasteProfile(db: Database, userId: string): Promise<TasteProfile> {
  const [profile] = await db
    .select({ body: tasteProfiles.body, updatedAt: tasteProfiles.updatedAt })
    .from(tasteProfiles)
    .where(eq(tasteProfiles.userId, userId));
  return profile ?? { body: '', updatedAt: null };
}

export async function updateTasteProfile(
  db: Database,
  userId: string,
  body: string,
): Promise<TasteProfile> {
  const updatedAt = new Date();
  const [profile] = await db
    .insert(tasteProfiles)
    .values({ userId, body, updatedAt })
    .onConflictDoUpdate({ target: tasteProfiles.userId, set: { body, updatedAt } })
    .returning({ body: tasteProfiles.body, updatedAt: tasteProfiles.updatedAt });
  return profile;
}
