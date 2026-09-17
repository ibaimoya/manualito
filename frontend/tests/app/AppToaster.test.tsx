import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { Providers } from '@/app/Providers';
import { useLanguage } from '@/app/language';
import { LiveTrans } from '@/shared/components/LiveTrans';

function LanguageControls() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button onClick={() => setLanguage('es')}>Español</button>
      <button onClick={() => setLanguage('en')}>English</button>
    </>
  );
}

function ActionProbe() {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <button
        onClick={() =>
          toast('Manual disponible', {
            duration: Infinity,
            action: { label: 'Abrir manual', onClick: () => setOpened(true) },
          })
        }
      >
        Mostrar notificación
      </button>
      {opened && <p>Manual abierto</p>}
    </>
  );
}

describe('AppToaster', () => {
  it('retraduce la región y el cierre con el aviso abierto y permite cerrarlo con teclado', async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <LanguageControls />
      </Providers>,
    );
    act(() => {
      toast.warning(<LiveTrans ns="shell" i18nKey="storage.quota.title" />, {
        duration: Infinity,
      });
    });

    await screen.findByText('Espacio local agotado');
    const region = screen.getByRole('region', { name: /^Notificaciones/ });
    const notification = within(region).getByRole('listitem');
    expect(within(region).getByRole('button', { name: 'Cerrar notificación' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('region', { name: /^Notifications/ })).toBe(region);
    expect(within(region).getByRole('listitem')).toBe(notification);
    expect(within(region).getByRole('button', { name: 'Dismiss notification' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Cerrar notificación' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Español' }));
    expect(screen.getByRole('region', { name: /^Notificaciones/ })).toBe(region);
    const close = within(region).getByRole('button', { name: 'Cerrar notificación' });
    act(() => close.focus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(notification).not.toBeInTheDocument());
  });

  it('actualiza la carga a éxito en el mismo aviso sin duplicar la notificación', async () => {
    render(<Providers>{null}</Providers>);
    act(() => {
      toast.loading('Guardando el manual', { id: 'manual-save' });
    });
    await screen.findByText('Guardando el manual');
    const region = screen.getByRole('region', { name: /^Notificaciones/ });
    const notification = within(region).getByRole('listitem');

    act(() => {
      toast.success('Manual guardado', { id: 'manual-save', duration: Infinity });
    });
    expect(await screen.findByText('Manual guardado')).toBeInTheDocument();
    expect(within(region).getAllByRole('listitem')).toEqual([notification]);
    expect(screen.queryByText('Guardando el manual')).not.toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Cerrar notificación' })).toBeEnabled();
  });

  it('permite activar la acción del aviso con teclado y ejecuta su resultado', async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <ActionProbe />
      </Providers>,
    );
    await user.click(screen.getByRole('button', { name: 'Mostrar notificación' }));
    const action = await screen.findByRole('button', { name: 'Abrir manual' });
    act(() => action.focus());
    await user.keyboard('{Enter}');
    expect(screen.getByText('Manual abierto')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Manual disponible')).not.toBeInTheDocument());
  });
});
