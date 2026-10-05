import { Dialog, DialogPanel, DialogTitle, Description } from '@headlessui/react';
import PropTypes from 'prop-types';

/** Confirmation for destructive actions (remove from cart, cancel order, unfollow…). */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/70" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md border border-bw-border bg-bw-surface p-6">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          {message && <Description className="mt-2 text-sm text-bw-muted">{message}</Description>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              {cancelLabel}
            </button>
            <button type="button" className={destructive ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
              {busy ? 'Please wait…' : confirmLabel}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.node,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  destructive: PropTypes.bool,
  busy: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
