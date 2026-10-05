import { useCallback, useEffect, useState } from 'react';

/**
 * Runs `load()` whenever `deps` change and tracks { data, loading, error }.
 * Stale responses (from an earlier deps value) are ignored. `reload()` re-runs it; `setData` allows optimistic updates.
 */
export function useAsync(load, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    load()
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch((error) => active && setState({ data: null, loading: false, error }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((update) => {
    setState((current) => ({ ...current, data: typeof update === 'function' ? update(current.data) : update }));
  }, []);

  return { ...state, reload, setData };
}

/** Value that only updates after `delay` ms without changes. */
export function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
