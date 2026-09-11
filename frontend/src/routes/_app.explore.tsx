import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FileTextIcon, PlusIcon, SparkleIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GameTypeahead } from '@/features/upload/GameTypeahead';
import { DiscoverGames } from '@/features/games/DiscoverGames';
import { Button } from '@/components/ui/button';
import { IllustrationBadge, type IllustrationTone } from '@/shared/components/IllustrationBadge';

export const Route = createFileRoute('/_app/explore')({
  component: ExploreScreen,
});

function ExploreScreen() {
  const { t } = useTranslation('explore');
  const navigate = useNavigate();

  return (
    <div className="page-frame page-stack">
      <header className="flex flex-col gap-3">
        <span className="page-eyebrow">{t('header.eyebrow')}</span>
        <h1 className="page-title">{t('header.title')}</h1>
        <p className="page-description">{t('header.description')}</p>
      </header>

      <GameTypeahead
        focusOnMount
        allowCreate={false}
        onSelect={(game) =>
          navigate({ to: '/game/$gameId', params: { gameId: game.id } }).catch(() => undefined)
        }
      />

      <ul className="grid gap-3 @3xl/app:grid-cols-3">
        <Hint
          tone="primary"
          icon={<SparkleIcon aria-hidden="true" className="illustration-spark" size={18} />}
          title={t('hints.instantQuestion.title')}
        >
          {t('hints.instantQuestion.description')}
        </Hint>
        <Hint
          tone="accent"
          icon={<FileTextIcon aria-hidden="true" className="illustration-page" size={18} />}
          title={t('hints.withoutUpload.title')}
        >
          {t('hints.withoutUpload.description')}
        </Hint>
        <Hint
          tone="green"
          icon={<UsersThreeIcon aria-hidden="true" className="illustration-people" size={18} />}
          title={t('hints.giveBack.title')}
        >
          {t('hints.giveBack.description')}
        </Hint>
      </ul>

      <DiscoverGames
        emptyState={
          <section className="rounded-2xl border border-dashed border-border-strong px-5 py-8 text-center">
            <h2 className="font-display text-xl font-bold">{t('discovery.empty.title')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
              {t('discovery.empty.description')}
            </p>
            <Button asChild variant="secondary" className="mt-5">
              <Link to="/capture/source">
                <PlusIcon data-icon-motion="plus" size={18} aria-hidden="true" />
                {t('discovery.empty.upload')}
              </Link>
            </Button>
          </section>
        }
      />
    </div>
  );
}

function Hint({
  tone,
  icon,
  title,
  children,
}: Readonly<{
  tone: IllustrationTone;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}>) {
  return (
    <li className="illustration-card rounded-2xl border border-border bg-surface p-3.5">
      <IllustrationBadge tone={tone}>{icon}</IllustrationBadge>
      <p className="mt-2 text-sm font-bold text-fg">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-fg-3">{children}</p>
    </li>
  );
}
