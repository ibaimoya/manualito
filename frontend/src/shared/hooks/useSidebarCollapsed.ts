import { useCallback, useState } from 'react';

/**
 * Estado plegado/expandido de la sidebar de escritorio, persistido en
 * localStorage para que la preferencia sobreviva recargas. Es preferencia de
 * UI pura (no afecta a datos), por eso vive fuera del wrapper `storage` con
 * validación Zod: una lectura tolerante a fallos basta.
 */
const KEY = 'manualito.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export interface SidebarCollapse {
  collapsed: boolean;
  toggle: () => void;
}

export function useSidebarCollapsed(): SidebarCollapse {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        // Almacenamiento no disponible (modo privado/cuota): el estado vive
        // solo en memoria durante esta sesión.
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
