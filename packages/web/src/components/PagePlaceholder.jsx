import PropTypes from 'prop-types';

/** Temporary page body used until each page is built in its own micro-task. */
export default function PagePlaceholder({ title }) {
  return (
    <section className="page">
      <h1 className="page-title">{title}</h1>
      <p className="text-bw-muted">Coming soon.</p>
    </section>
  );
}

PagePlaceholder.propTypes = { title: PropTypes.string.isRequired };
