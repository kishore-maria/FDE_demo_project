import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import PropTypes from 'prop-types';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { errorMessage } from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import FormField, { fieldShape } from './FormField.jsx';
import { slugify, validateFields } from './forms.js';

function EntityDialog({ title, fields, initialValues, validate, onSubmit, onClose }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // New items get a slug generated from the name until the slug is edited by hand.
  const [autoSlug, setAutoSlug] = useState(!initialValues.slug);

  const change = (name, value) => {
    setValues((current) => {
      const next = { ...current, [name]: value };
      if (name === 'name' && autoSlug && fields.some((field) => field.name === 'slug')) next.slug = slugify(value);
      return next;
    });
    if (name === 'slug') setAutoSlug(false);
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = { ...validateFields(fields, values), ...(validate?.(values) ?? {}) };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? () => {} : onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/70" aria-hidden />
      <div className="fixed inset-0 overflow-y-auto p-4">
        <DialogPanel className="mx-auto w-full max-w-lg border border-bw-border bg-bw-surface p-6">
          <DialogTitle className="mb-4 text-lg font-semibold">{title}</DialogTitle>
          <form noValidate onSubmit={submit} className="space-y-4">
            {fields.map((field) => (
              <FormField key={field.name} field={field} value={values[field.name]} error={errors[field.name]} onChange={change} />
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

EntityDialog.propTypes = {
  title: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(fieldShape).isRequired,
  initialValues: PropTypes.object.isRequired,
  validate: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

/**
 * Table + create/edit dialog + delete confirmation for a flat admin resource.
 * `api` must be stable between renders (memoise it when built per store).
 * `fields` may be a function of the loaded items (e.g. a parent-category select).
 */
export default function CrudSection({ title, itemLabel, api, columns, fields, emptyValues, toForm, toPayload, validate, nameOf }) {
  const { data: items, loading, error, reload } = useAsync(() => api.list(), [api]);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const fieldList = typeof fields === 'function' ? fields(items ?? [], editing?.item) : fields;

  const save = async (values) => {
    const body = toPayload(values);
    if (editing.item) await api.update(editing.item.id, body);
    else await api.create(body);
    toast.success(`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} saved`);
    setEditing(null);
    reload();
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.remove(deleting.id);
      toast.success(`Deleted ${nameOf(deleting)}`);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button type="button" className="btn-primary" onClick={() => setEditing({ item: null })}>
          Add {itemLabel}
        </button>
      </div>

      {loading && <LoadingSpinner label={`Loading ${title.toLowerCase()}…`} />}
      {error && <p className="text-red-400">{errorMessage(error)}</p>}
      {items && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-bw-border text-xs uppercase text-bw-subtle">
              <tr>
                {columns.map((column) => (
                  <th key={column.header} className="px-2 py-2 font-medium">
                    {column.header}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-2 py-6 text-center text-bw-muted">
                    Nothing here yet.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className="border-b border-bw-border">
                  {columns.map((column) => (
                    <td key={column.header} className="px-2 py-2">
                      {column.cell(item)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button type="button" className="btn-ghost text-xs" onClick={() => setEditing({ item })} aria-label={`Edit ${nameOf(item)}`}>
                      Edit
                    </button>
                    <button type="button" className="btn-ghost text-xs text-red-400" onClick={() => setDeleting(item)} aria-label={`Delete ${nameOf(item)}`}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EntityDialog
          title={editing.item ? `Edit ${nameOf(editing.item)}` : `New ${itemLabel}`}
          fields={fieldList}
          initialValues={editing.item ? toForm(editing.item) : emptyValues}
          validate={validate}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting ? `Delete ${nameOf(deleting)}?` : ''}
        message="This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}

CrudSection.propTypes = {
  title: PropTypes.string.isRequired,
  itemLabel: PropTypes.string.isRequired,
  api: PropTypes.shape({
    list: PropTypes.func.isRequired,
    create: PropTypes.func.isRequired,
    update: PropTypes.func.isRequired,
    remove: PropTypes.func.isRequired,
  }).isRequired,
  columns: PropTypes.arrayOf(PropTypes.shape({ header: PropTypes.string.isRequired, cell: PropTypes.func.isRequired })).isRequired,
  fields: PropTypes.oneOfType([PropTypes.arrayOf(fieldShape), PropTypes.func]).isRequired,
  emptyValues: PropTypes.object.isRequired,
  toForm: PropTypes.func.isRequired,
  toPayload: PropTypes.func.isRequired,
  validate: PropTypes.func,
  nameOf: PropTypes.func.isRequired,
};
