import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="page flex flex-col items-center py-24 text-center">
      <p className="text-6xl font-light text-bw-subtle">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-bw-muted">The page you are looking for doesn&apos;t exist or has moved.</p>
      <Link to="/" className="btn-primary mt-8 no-underline hover:no-underline">
        Back to the catalogue
      </Link>
    </section>
  );
}
