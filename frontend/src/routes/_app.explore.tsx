import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FileText, Sparkles, Users } from 'lucide-react';
import { type ReactNode } from 'react';
import { GameTypeahead } from '@/features/upload/GameTypeahead';

export const Route = createFileRoute('/_app/explore')({
  component: ExploreScreen,
});

function ExploreScreen() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-5 pb-10 pt-4 md:px-8 md:pt-10">
      <header className="flex flex-col gap-2">
        <span className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
          De la comunidad
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Explorar juegos
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-fg-2">
          Busca un juego que alguien ya haya explicado y pregúntale sin subir su manual. El número
          junto a cada resultado son los manuales que la comunidad ha compartido.
        </p>
      </header>

      <GameTypeahead
        focusOnMount
        allowCreate={false}
        onSelect={(game) =>
          navigate({ to: '/game/$gameId', params: { gameId: game.id } }).catch(() => undefined)
        }
      />

      <ul className="grid gap-3 sm:grid-cols-3">
        <Hint icon={<Sparkles strokeWidth={2} />} title="Pregunta al instante">
          Si la comunidad lo ha compartido, respondemos citando la página exacta.
        </Hint>
        <Hint icon={<FileText strokeWidth={2} />} title="Sin subir nada">
          No necesitas tener el manual: te apoyas en el de otra persona.
        </Hint>
        <Hint icon={<Users strokeWidth={2} />} title="Devuelve el favor">
          Comparte tus manuales y ayuda a que otros entiendan sus juegos.
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
