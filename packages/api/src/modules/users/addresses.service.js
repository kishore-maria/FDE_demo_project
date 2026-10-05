import { notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { serializeAddress, toAddressData } from './addresses.serializer.js';

// Another user's address id returns 404, never 403, so ids can't be probed.
async function findOwnAddress(userId, addressId, client = prisma) {
  const address = await client.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw notFound('Address not found');
  return address;
}

/** GET /users/me/addresses — default first, then newest. */
export async function listAddresses(userId) {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return addresses.map(serializeAddress);
}

/** The first address a user saves becomes their default. */
export async function createAddress(userId, input) {
  const hasAny = (await prisma.address.count({ where: { userId } })) > 0;
  const address = await prisma.address.create({
    data: { userId, ...toAddressData(input), isDefault: !hasAny },
  });
  return serializeAddress(address);
}

/** PUT /users/me/addresses/:id — replaces the address fields (default flag unchanged). */
export async function updateAddress(userId, addressId, input) {
  await findOwnAddress(userId, addressId);
  const address = await prisma.address.update({ where: { id: addressId }, data: toAddressData(input) });
  return serializeAddress(address);
}

/** Deleting the default promotes the most recently added remaining address. */
export async function deleteAddress(userId, addressId) {
  await prisma.$transaction(async (tx) => {
    const address = await findOwnAddress(userId, addressId, tx);
    await tx.address.delete({ where: { id: addressId } });
    if (!address.isDefault) return;
    const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
  });
}

/** PUT /users/me/addresses/:id/default — exactly one default address per user. */
export async function setDefaultAddress(userId, addressId) {
  const address = await prisma.$transaction(async (tx) => {
    await findOwnAddress(userId, addressId, tx);
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
  });
  return serializeAddress(address);
}
