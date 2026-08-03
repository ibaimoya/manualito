import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FileText, Sparkles, Users } from 'lucide-react';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GameTypeahead } from '@/features/upload/GameTypeahead';

export const Route = createFileRoute('/_app/explore')({
  component: ExploreScreen,
});

function ExploreScreen() {
  const { t } = useTranslation('explore');
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-5 pb-10 pt-4 md:px-8 md:pt-10">
      <header className="flex flex-col gap-2">
        <span className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
          {t('header.eyebrow')}
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          {t('header.title')}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-fg-2">{t('header.description')}</p>
      </header>

      <GameTypeahead
        focusOnMount
        allowCreate={false}
        onSelect={(game) =>
          navigate({ to: '/game/$gameId', params: { gameId: game.id } }).catch(() => undefined)
        }
      />

      <ul className="grid gap-3 sm:grid-cols-3">
        <Hint icon={<Sparkles strokeWidth={2} />} title={t('hints.instantQuestion.title')}>
          {t('hints.instantQuestion.description')}
        </Hint>
        <Hint icon={<FileText strokeWidth={2} />} title={t('hints.withoutUpload.title')}>
          {t('hints.withoutUpload.description')}
        </Hint>
        <Hint icon={<Users strokeWidth={2} />} title={t('hints.giveBack.title')}>
          {t('hints.giveBack.description')}
        </Hint>
      </ul>
    </div>
  );
}

function Hint({
  icon,
  title,
  children,
}: Readonly<{ icon: ReactNode; title: string; children: ReactNode }>) {
  return (
    <li className="rounded-2xl border border-border bg-surface p-3.5">
      <span
        className="grid size-8 place-items-center rounded-lg bg-primary-100 text-primary-700 [&_svg]:size-[15px]"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="mt-2 text-sm font-bold text-fg">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-fg-3">{children}</p>
    </li>
  );
}
