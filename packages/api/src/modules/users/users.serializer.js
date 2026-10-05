import { formatINR } from 'bookworm-shared';

/** Public shape of a user (never includes passwordHash). */
export function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? null,
    role: user.role,
    giftPoints: user.giftPoints,
    walletBalancePaise: user.walletBalancePaise,
    walletBalanceInr: formatINR(user.walletBalancePaise),
    createdAt: user.createdAt.toISOString(),
  };
}
