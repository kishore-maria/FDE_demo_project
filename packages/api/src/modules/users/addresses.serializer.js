/** Public shape of a saved address. */
export function serializeAddress(address) {
  return {
    id: address.id,
    firstName: address.firstName,
    lastName: address.lastName,
    email: address.email,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    pin: address.pin,
    state: address.state,
    country: address.country,
    isDefault: address.isDefault,
  };
}

/** Normalises AddressInput into the columns shared by addresses and order snapshots. */
export function toAddressData(input) {
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone,
    line1: input.line1.trim(),
    line2: input.line2?.trim() || null,
    city: input.city.trim(),
    pin: input.pin,
    state: input.state.trim(),
    country: input.country?.trim() || 'India',
  };
}
