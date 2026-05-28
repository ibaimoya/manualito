import { Providers } from './Providers';
import { AppRouter } from './AppRouter';

/**
 * Componente raíz de la PWA.
 *
 * Encapsula:
 * - Providers (QueryClient, Theme, Toaster).
 * - Router (TanStack Router con file-based routing).
 *
 * El árbol real de pantallas vive bajo `src/routes/`.
 */
export function App() {
  return (
    <Providers>
      <AppRouter />
    </Providers>
  );
}
