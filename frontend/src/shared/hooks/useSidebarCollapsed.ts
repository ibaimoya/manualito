import { useEffect, useState } from 'react';
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
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, collapsed ? '1' : '0');
    } catch {
      // La preferencia sigue funcionando si el navegador bloquea el almacenamiento.
    }
  }, [collapsed]);

  return { collapsed, toggle: () => setCollapsed((current) => !current) };
}
