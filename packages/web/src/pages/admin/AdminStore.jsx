import { useMemo, useState } from 'react';
import { adminApi } from '../../api/admin.js';
import { errorMessage } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import CrudSection from './CrudSection.jsx';
import { compact } from './forms.js';

const POLICY_TYPES = ['RETURN', 'CANCELLATION', 'SHIPPING', 'PAYMENT'];
const policyLabel = (type) => type[0] + type.slice(1).toLowerCase();

function Policies({ storeId }) {
  const api = useMemo(() => adminApi.policies(storeId), [storeId]);
  return (
    <CrudSection
      title="Policies"
      itemLabel="policy"
      api={api}
      nameOf={(p) => p.title}
      columns={[
        { header: 'Type', cell: (p) => policyLabel(p.type) },
        { header: 'Title', cell: (p) => p.title },
        { header: 'Content', cell: (p) => <span className="line-clamp-2 text-bw-muted">{p.content}</span> },
      ]}
      fields={[
        { name: 'type', label: 'Type', type: 'select', required: true, options: POLICY_TYPES.map((type) => ({ value: type, label: policyLabel(type) })) },
        { name: 'title', label: 'Title', required: true },
        { name: 'content', label: 'Content', type: 'textarea', required: true },
      ]}
      emptyValues={{ type: '', title: '', content: '' }}
      toForm={(p) => ({ type: p.type, title: p.title, content: p.content })}
      toPayload={compact}
    />
  );
}

/** Store details plus the selected store's policies. */
export default function AdminStore() {
  const stores = useAsync(() => adminApi.stores.list(), []);
  const [selected, setSelected] = useState('');
  const storeId = selected || stores.data?.[0]?.id;

  return (
    <div className="space-y-10">
      <CrudSection
        title="Stores"
        itemLabel="store"
        api={adminApi.stores}
        nameOf={(s) => s.name}
        columns={[
          { header: 'Name', cell: (s) => s.name },
          { header: 'Slug', cell: (s) => <span className="font-mono text-xs">{s.slug}</span> },
          { header: 'Status', cell: (s) => <StatusBadge status={s.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
        ]}
        fields={[
          { name: 'name', label: 'Name', required: true },
          { name: 'slug', label: 'Slug', type: 'slug', required: true },
          { name: 'description', label: 'Description', type: 'textarea', required: true },
          { name: 'isActive', label: 'Active', type: 'checkbox' },
        ]}
        emptyValues={{ name: '', slug: '', description: '', isActive: true }}
        toForm={(s) => ({ name: s.name, slug: s.slug, description: s.description, isActive: s.isActive })}
        toPayload={compact}
      />

      {stores.error && <p className="text-red-400">{errorMessage(stores.error)}</p>}
      {stores.data?.length > 1 && (
        <div>
          <label htmlFor="policy-store" className="label">
            Policies for store
          </label>
          <select id="policy-store" className="input max-w-xs" value={storeId} onChange={(event) => setSelected(event.target.value)}>
            {stores.data.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {storeId && <Policies key={storeId} storeId={storeId} />}
    </div>
  );
}
