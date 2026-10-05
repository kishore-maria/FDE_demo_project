import { formatINR } from 'bookworm-shared';
import { adminApi } from '../../api/admin.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatDate } from '../../utils/format.js';
import CrudSection from './CrudSection.jsx';
import { compact, dateToIso, isoToDate, paiseToRupees, rupeesToPaise } from './forms.js';

const byName = (item) => item.name;
const name = { name: 'name', label: 'Name', required: true };
const slug = { name: 'slug', label: 'Slug', type: 'slug', required: true, hint: 'Used in URLs, e.g. self-help' };
const count = { header: 'Books', cell: (item) => item.bookCount ?? 0 };

export function AdminCategories() {
  return (
    <CrudSection
      title="Categories"
      itemLabel="category"
      api={adminApi.categories}
      nameOf={byName}
      columns={[
        { header: 'Name', cell: (c) => c.name },
        { header: 'Slug', cell: (c) => <span className="font-mono text-xs">{c.slug}</span> },
        { header: 'Order', cell: (c) => c.displayOrder },
        { header: 'Sidebar', cell: (c) => (c.showInSidebar ? 'Yes' : 'No') },
        count,
      ]}
      fields={(items, editing) => [
        name,
        slug,
        {
          name: 'parentId',
          label: 'Parent category',
          type: 'select',
          options: items.filter((c) => !c.parentId && c.id !== editing?.id).map((c) => ({ value: c.id, label: c.name })),
        },
        { name: 'displayOrder', label: 'Display order', type: 'number' },
        { name: 'showInSidebar', label: 'Show in sidebar', type: 'checkbox' },
      ]}
      emptyValues={{ name: '', slug: '', parentId: '', displayOrder: '0', showInSidebar: true }}
      toForm={(c) => ({ name: c.name, slug: c.slug, parentId: c.parentId ?? '', displayOrder: String(c.displayOrder), showInSidebar: c.showInSidebar })}
      toPayload={(v) => ({
        name: v.name.trim(),
        slug: v.slug.trim(),
        parentId: v.parentId || null,
        displayOrder: Number(v.displayOrder || 0),
        showInSidebar: v.showInSidebar,
      })}
    />
  );
}

export function AdminPublishers() {
  return (
    <CrudSection
      title="Publishers"
      itemLabel="publisher"
      api={adminApi.publishers}
      nameOf={byName}
      columns={[
        { header: 'Name', cell: (p) => p.name },
        { header: 'Slug', cell: (p) => <span className="font-mono text-xs">{p.slug}</span> },
        count,
      ]}
      fields={[
        name,
        slug,
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'logoUrl', label: 'Logo URL', type: 'url' },
      ]}
      emptyValues={{ name: '', slug: '', description: '', logoUrl: '' }}
      toForm={(p) => ({ name: p.name, slug: p.slug, description: p.description ?? '', logoUrl: p.logoUrl ?? '' })}
      toPayload={compact}
    />
  );
}

export function AdminAuthors() {
  return (
    <CrudSection
      title="Authors"
      itemLabel="author"
      api={adminApi.authors}
      nameOf={byName}
      columns={[
        { header: 'Name', cell: (a) => a.name },
        { header: 'Slug', cell: (a) => <span className="font-mono text-xs">{a.slug}</span> },
        count,
      ]}
      fields={[name, slug, { name: 'bio', label: 'Bio', type: 'textarea', required: true }, { name: 'photoUrl', label: 'Photo URL', type: 'url' }]}
      emptyValues={{ name: '', slug: '', bio: '', photoUrl: '' }}
      toForm={(a) => ({ name: a.name, slug: a.slug, bio: a.bio, photoUrl: a.photoUrl ?? '' })}
      toPayload={compact}
    />
  );
}

const couponValue = (c) => (c.discountType === 'PERCENT' ? `${c.discountValue}%` : formatINR(c.discountValue));

export function AdminCoupons() {
  return (
    <CrudSection
      title="Coupons"
      itemLabel="coupon"
      api={adminApi.coupons}
      nameOf={(c) => c.code}
      columns={[
        { header: 'Code', cell: (c) => <span className="font-mono">{c.code}</span> },
        { header: 'Discount', cell: couponValue },
        { header: 'Min order', cell: (c) => formatINR(c.minOrderValuePaise) },
        { header: 'Valid until', cell: (c) => formatDate(c.validUntil) },
        { header: 'Used', cell: (c) => `${c.usedCount}${c.usageLimit ? ` / ${c.usageLimit}` : ''}` },
        { header: 'Status', cell: (c) => <StatusBadge status={c.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
      ]}
      fields={[
        { name: 'code', label: 'Code', required: true, pattern: { regex: /^[A-Z0-9]{3,30}$/, message: '3–30 capital letters or digits' } },
        {
          name: 'discountType',
          label: 'Discount type',
          type: 'select',
          required: true,
          options: [
            { value: 'FLAT', label: 'Flat amount (₹)' },
            { value: 'PERCENT', label: 'Percent (%)' },
          ],
        },
        { name: 'discountValue', label: 'Discount value', type: 'money', required: true, hint: '₹ for flat coupons, whole % for percent coupons' },
        { name: 'maxDiscount', label: 'Max discount (₹)', type: 'money' },
        { name: 'minOrderValue', label: 'Minimum order (₹)', type: 'money' },
        { name: 'validUntil', label: 'Valid until', type: 'date', required: true },
        { name: 'usageLimit', label: 'Usage limit', type: 'number' },
        { name: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      validate={(v) =>
        v.discountType === 'PERCENT' && !/^([1-9]\d?|100)$/.test(v.discountValue) ? { discountValue: 'Percent must be a whole number from 1 to 100' } : {}
      }
      emptyValues={{ code: '', discountType: 'FLAT', discountValue: '', maxDiscount: '', minOrderValue: '', validUntil: '', usageLimit: '', isActive: true }}
      toForm={(c) => ({
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountType === 'PERCENT' ? String(c.discountValue) : paiseToRupees(c.discountValue),
        maxDiscount: paiseToRupees(c.maxDiscountPaise),
        minOrderValue: paiseToRupees(c.minOrderValuePaise),
        validUntil: isoToDate(c.validUntil),
        usageLimit: c.usageLimit ? String(c.usageLimit) : '',
        isActive: c.isActive,
      })}
      toPayload={(v) => ({
        code: v.code.trim(),
        discountType: v.discountType,
        discountValue: v.discountType === 'PERCENT' ? Number(v.discountValue) : rupeesToPaise(v.discountValue),
        maxDiscountPaise: v.maxDiscount ? rupeesToPaise(v.maxDiscount) : null,
        minOrderValuePaise: v.minOrderValue ? rupeesToPaise(v.minOrderValue) : 0,
        validUntil: dateToIso(v.validUntil),
        usageLimit: v.usageLimit ? Number(v.usageLimit) : null,
        isActive: v.isActive,
      })}
    />
  );
}
