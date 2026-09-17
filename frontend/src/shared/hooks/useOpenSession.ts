import { useState } from 'react';

/** Renueva la key al abrir, aunque Radix aún conserve el diálogo que está saliendo. */
export function useOpenSession(open: boolean): number {
  const [state, setState] = useState({ open, session: 0 });
  if (state.open !== open) {
    setState({ open, session: open ? state.session + 1 : state.session });
  }
  return state.session;
}
