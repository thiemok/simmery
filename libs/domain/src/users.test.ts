import { users, type Database } from '@simmery/db';
import { createTestDatabase, type TestDatabase } from '@simmery/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureUser } from './users.js';

let testDb: TestDatabase;
let db: Database;

beforeEach(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
});

afterEach(async () => {
  await testDb.close();
});

const allUsers = () => db.select({ id: users.id, email: users.email }).from(users);

describe('ensureUser', () => {
  it('creates the user on first sight and reuses the row afterwards', async () => {
    await ensureUser(db, { id: 'user_a', email: 'a@example.com' });
    await ensureUser(db, { id: 'user_a', email: 'a@example.com' });
    expect(await allUsers()).toEqual([{ id: 'user_a', email: 'a@example.com' }]);
  });

  it('creates one row when first requests race', async () => {
    await Promise.all(
      Array.from({ length: 5 }, () => ensureUser(db, { id: 'user_a', email: 'a@example.com' })),
    );
    expect(await allUsers()).toHaveLength(1);
  });

  it('follows an email change', async () => {
    await ensureUser(db, { id: 'user_a', email: 'a@example.com' });
    await ensureUser(db, { id: 'user_a', email: 'new@example.com' });
    expect(await allUsers()).toEqual([{ id: 'user_a', email: 'new@example.com' }]);
  });
});
