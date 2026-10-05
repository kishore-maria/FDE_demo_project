import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { errorMessage } from '../../api/client.js';
import { ordersApi } from '../../api/orders.js';
import AddressForm from '../../components/AddressForm.jsx';

/** Edits an order's delivery address. `updateAddress` defaults to the signed-in session's API. */
export default function AddressDialog({ order, onClose, onSaved, updateAddress = ordersApi.updateAddress }) {
  const [saving, setSaving] = useState(false);
  const { line2, ...address } = order.shippingAddress;

  const save = async (payload) => {
    setSaving(true);
    try {
      const updated = await updateAddress(order.id, payload);
      toast.success('Delivery address updated');
      onSaved(updated);
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? () => {} : onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/70" aria-hidden />
      <div className="fixed inset-0 overflow-y-auto p-4">
        <DialogPanel className="mx-auto w-full max-w-2xl border border-bw-border bg-bw-surface p-6">
          <DialogTitle className="mb-4 text-lg font-semibold">Change delivery address</DialogTitle>
          <AddressForm formId="order-address-form" initialValue={{ ...address, line2: line2 ?? '' }} onSubmit={save} />
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="order-address-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save address'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

AddressDialog.propTypes = {
  order: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  updateAddress: PropTypes.func,
};
