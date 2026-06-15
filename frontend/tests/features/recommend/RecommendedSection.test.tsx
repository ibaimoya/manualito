import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { server } from '@tests/_helpers/server';
import { RecommendedSection } from '@/features/recommend/RecommendedSection';
import { RECOMMENDATIONS_KEY } from '@/features/recommend/use-recommendations';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: () => <RecommendedSection /> });
  const capture = createRoute({
    getParentRoute: () => root,
    path: '/capture/source',
    component: () => <div>Source</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([capture]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return qc;
}

describe('RecommendedSection (Para ti)', () => {
  it('renderiza las recomendaciones, la atribución y el enlace para aprender', async () => {
    renderSection();
    expect(await screen.findByRole('heading', { name: /Para ti/i })).toBeInTheDocument();
    expect(screen.getByText('Carcassonne')).toBeInTheDocument();
    expect(screen.getByText('Ticket to Ride')).toBeInTheDocument();
    expect(screen.getByText('Porque tienes Catan')).toBeInTheDocument();
    expect(screen.getByText('BoardGameGeek')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Aprender Carcassonne/i })).toHaveAttribute(
      'href',
      '/capture/source',
    );
  });

  it('si no hay recomendaciones, no muestra la sección', async () => {
    server.use(
      http.get('/api/recommendations', () =>
        HttpResponse.json({ recommendations: [], attribution: 'x' }),
      ),
    );
    const qc = renderSection();
    await waitFor(() => expect(qc.getQueryData(RECOMMENDATIONS_KEY)).toEqual([]));
    expect(screen.queryByRole('heading', { name: /Para ti/i })).not.toBeInTheDocument();
  });
});
