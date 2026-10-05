import { vi } from 'vitest';

// Usage in a test file: vi.mock('react-hot-toast', () => import('../test/toastMock.js'));
const toast = vi.fn();
toast.error = vi.fn();
toast.success = vi.fn();
toast.dismiss = vi.fn();

export default toast;
export { toast };
export const Toaster = () => null;
