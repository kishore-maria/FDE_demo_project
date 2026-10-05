import { formatINR } from 'bookworm-shared';

// Placeholder until the app shell is built in MT-23.
export default function App() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Book Worm</h1>
      <p>Shared package check: Joy of Minimalism costs {formatINR(14900)}</p>
    </main>
  );
}
