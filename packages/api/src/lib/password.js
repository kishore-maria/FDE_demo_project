import bcrypt from 'bcryptjs';

const rounds = () => Number(process.env.BCRYPT_ROUNDS ?? 12);

// Compared against when the user doesn't exist, so login timing doesn't reveal registered emails.
const DUMMY_HASH = bcrypt.hashSync('bookworm-timing-guard', 10);

export function hashPassword(password) {
  return bcrypt.hash(password, rounds());
}

/** Returns false for missing hashes (guests) while still spending comparable time. */
export async function verifyPassword(password, passwordHash) {
  if (!passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
