import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './router/AppRouter.jsx';

export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

export default function App() {
  return (
    <BrowserRouter future={ROUTER_FUTURE}>
      <AppRoutes />
    </BrowserRouter>
  );
}
