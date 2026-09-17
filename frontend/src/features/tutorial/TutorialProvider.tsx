import { useLocation } from '@tanstack/react-router';
import { useEffect, useLayoutEffect } from 'react';
import { useAuth } from '@/features/auth/use-auth';
import { tutorial } from './controller';

const WELCOME_ROUTE = '/home';

export function TutorialProvider() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useLocation({ select: (location) => location.searchStr });

  // Cancela la navegación antes de que el observador detecte la retirada del objetivo.
  useLayoutEffect(() => {
    tutorial.onLocationChange({ pathname, search });
  }, [pathname, search]);

  useEffect(() => {
    tutorial.setUser(userId);
  }, [userId]);

  useEffect(() => {
    if (userId !== null && pathname === WELCOME_ROUTE) tutorial.autoStart();
  }, [userId, pathname]);

  useEffect(() => () => tutorial.close(), []);

  return null;
}
