import PropTypes from 'prop-types';
import { BookIcon } from './icons.jsx';

export default function EmptyState({ title, message, action = null, icon = null }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="text-bw-subtle">{icon ?? <BookIcon className="h-10 w-10" />}</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {message && <p className="max-w-md text-sm text-bw-muted">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  message: PropTypes.string,
  action: PropTypes.node,
  icon: PropTypes.node,
};
