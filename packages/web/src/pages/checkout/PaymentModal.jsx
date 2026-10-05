import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import PropTypes from 'prop-types';

/** Placeholder; the full payment flow (tabs, card, UPI, wallet, retry) arrives in MT-30. */
export default function PaymentModal({ order, onClose }) {
  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/70" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg border border-bw-border bg-bw-surface p-6">
          <DialogTitle className="text-xl font-semibold">Complete Payment</DialogTitle>
          <p className="mt-2 text-bw-muted">
            Payable Amount: <span className="font-semibold text-white">{order.totals.totalInr}</span>
          </p>
          <button type="button" className="btn-secondary mt-6" onClick={onClose}>
            Close
          </button>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

PaymentModal.propTypes = {
  order: PropTypes.shape({ totals: PropTypes.shape({ totalInr: PropTypes.string }) }).isRequired,
  onClose: PropTypes.func.isRequired,
};
