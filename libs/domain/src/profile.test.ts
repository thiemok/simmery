import { users, type Database } from '@simmery/db';
import { createTestDatabase, type TestDatabase } from '@simmery/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTasteProfile, updateTasteProfile } from './profile.js';

let testDb: TestDatabase;
let db: Database;

beforeEach(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
  await db.insert(users).values([
    { id: 'user_a', email: 'a@example.com' },
    { id: 'user_b', email: 'b@example.com' },
  ]);
});

afterEach(async () => {
  await testDb.close();
});

describe('taste profile', () => {
  it('reads an unwritten profile as empty', async () => {
    expect(await getTasteProfile(db, 'user_a')).toEqual({ body: '', updatedAt: null });
  });

  it('replaces the whole text and keeps markdown whitespace', async () => {
    await updateTasteProfile(db, 'user_a', '# Likes\n\n- spicy\n');
    const updated = await updateTasteProfile(db, 'user_a', '- no coriander\n');
    expect(updated.body).toBe('- no coriander\n');
    expect(await getTasteProfile(db, 'user_a')).toEqual(updated);
  });

  it('leaves another user’s profile untouched', async () => {
    await updateTasteProfile(db, 'user_b', 'loves fish');
    await updateTasteProfile(db, 'user_a', 'no fish');
    expect((await getTasteProfile(db, 'user_b')).body).toBe('loves fish');
  });
});
