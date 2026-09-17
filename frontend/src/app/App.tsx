import { Providers } from './Providers';
import { AppRouter } from './AppRouter';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';

/** Raíz de la PWA: Providers + Router. Las pantallas viven en src/routes/. */
export function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <AppRouter />
      </Providers>
    </ErrorBoundary>
  );
}
