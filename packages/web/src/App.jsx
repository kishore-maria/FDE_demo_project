import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './router/AppRouter.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
