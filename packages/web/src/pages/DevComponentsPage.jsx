import PropTypes from 'prop-types';
import { useState } from 'react';
import AddressForm from '../components/AddressForm.jsx';
import AuthorCard from '../components/AuthorCard.jsx';
import BookCard from '../components/BookCard.jsx';
import Breadcrumb from '../components/Breadcrumb.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import OrderSummaryPanel from '../components/OrderSummaryPanel.jsx';
import ShipmentTimeline from '../components/ShipmentTimeline.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';
import StarRating from '../components/StarRating.jsx';
import StatusBadge, { STATUS_LABELS } from '../components/StatusBadge.jsx';

const book = {
  id: 'demo-book',
  title: 'Joy of Minimalism',
  shortDescription: 'Declutter your life to uncover peace, clarity, and joy.',
  author: { id: 'demo-author', name: 'Daniel Reed' },
  categories: [{ name: 'Self-help', slug: 'self-help' }],
  pricePaise: 14900,
  priceInr: '₹149',
  format: 'PAPERBACK',
  coverImageUrl: 'https://picsum.photos/seed/joy-of-minimalism-front/400/600',
  deliveryText: 'Delivery by Thu, 8 Oct',
  inStock: true,
};

const now = new Date().toISOString();
const shipment = {
  type: 'FORWARD',
  trackingNumber: 'TRK-DEMO000001',
  carrier: 'BookWorm Express',
  status: 'SHIPPED',
  estimatedDeliveryText: 'Delivery by Thu, 8 Oct',
  events: [
    { status: 'PROCESSING', note: 'Order confirmed and being packed', occurredAt: now },
    { status: 'SHIPPED', note: 'Handed over to BookWorm Express', occurredAt: now },
  ],
};

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 border-b border-bw-border pb-1 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

Section.propTypes = { title: PropTypes.string.isRequired, children: PropTypes.node };

/** DEV-only showcase of the shared components (route registered only when import.meta.env.DEV). */
export default function DevComponentsPage() {
  const [rating, setRating] = useState(3);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="page">
      <h1 className="page-title">Component showcase</h1>
      <Section title="Breadcrumb">
        <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Non-Fiction', to: '/?category=non-fiction' }, { label: 'Self-help' }]} />
      </Section>
      <Section title="BookCard">
        <div className="grid gap-4 md:grid-cols-2">
          <BookCard book={book} />
          <BookCard book={{ ...book, id: 'demo-ebook', format: 'EBOOK', deliveryText: 'Instant download' }} compact />
        </div>
      </Section>
      <Section title="AuthorCard">
        <AuthorCard
          author={{ id: 'demo-author', name: 'Daniel Reed', bio: 'Writes about simple living.', bookCount: 4, topCategory: { name: 'Self-help' } }}
          onFollow={() => {}}
        />
      </Section>
      <Section title="StatusBadge">
        <div className="flex flex-wrap gap-2">
          {Object.keys(STATUS_LABELS).map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </Section>
      <Section title="StarRating">
        <div className="flex items-center gap-6">
          <StarRating value={4.6} />
          <StarRating value={rating} onChange={setRating} label="Your rating" />
        </div>
      </Section>
      <Section title="Loading states">
        <LoadingSpinner />
        <SkeletonCard />
      </Section>
      <Section title="EmptyState">
        <EmptyState title="Your wishlist is empty" message="Save books you love to find them later." />
      </Section>
      <Section title="ConfirmDialog">
        <button type="button" className="btn-danger" onClick={() => setDialogOpen(true)}>
          Open dialog
        </button>
        <ConfirmDialog
          open={dialogOpen}
          title="Remove from cart?"
          message="Joy of Minimalism will be removed."
          destructive
          onConfirm={() => setDialogOpen(false)}
          onClose={() => setDialogOpen(false)}
        />
      </Section>
      <Section title="OrderSummaryPanel">
        <div className="max-w-sm">
          <OrderSummaryPanel
            totals={{ itemCount: 2, subtotalPaise: 50800, taxPaise: 6096, deliveryChargePaise: 0, couponDiscountPaise: 10000, giftDiscountPaise: 0, totalPaise: 46896 }}
          />
        </div>
      </Section>
      <Section title="ShipmentTimeline">
        <ShipmentTimeline shipment={shipment} />
      </Section>
      <Section title="AddressForm">
        <AddressForm onSubmit={() => {}}>
          <button type="submit" className="btn-primary">
            Validate
          </button>
        </AddressForm>
      </Section>
    </div>
  );
}
