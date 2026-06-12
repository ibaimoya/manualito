import { Providers } from './Providers';
import { AppRouter } from './AppRouter';

/** Raíz de la PWA: Providers + Router. Las pantallas viven en src/routes/. */
export function App() {
  return (
    <Providers>
      <AppRouter />
    </Providers>
  );
}
