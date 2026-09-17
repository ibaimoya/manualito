import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryHistory } from '@tanstack/react-router';
import { App } from '@/app/App';
import { router } from '@/app/AppRouter';
import { server } from '@tests/_helpers/server';
import { unauthenticatedMe } from '@tests/_helpers/mswHandlers';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('App', () => {
  it('resuelve la sesión y monta el login con router y proveedores reales', async () => {
    server.use(unauthenticatedMe());
    router.update({
      ...router.options,
      history: createMemoryHistory({ initialEntries: ['/login'] }),
    });
    localStorage.setItem('manualito.settings', JSON.stringify({ mode: 'dark', accent: 'amber' }));

    render(<App />);

    expect(await screen.findByLabelText('Email o usuario')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('theme-dark');
  });
});
