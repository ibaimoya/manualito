import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Pencil, RotateCw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { ManualDetailPage } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';

/** Cota del backend (`MANUAL_PAGE_TEXT_MAX_LENGTH`). */
const PAGE_TEXT_MAX = 20_000;

/** Texto canónico de la página: las líneas tal y como las guarda el backend. */
function pageText(page: ManualDetailPage): string {
  return page.ocr_lines.map((line) => line.text).join('\n');
}

/** Párrafos visibles (sin líneas en blanco) para la vista de lectura. */
function pageParagraphs(page: ManualDetailPage): string[] {
  return page.ocr_lines
    .flatMap((line) => line.text.split('\n'))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Resalta las coincidencias de `needle` dentro de `text`. `counter` lleva el
 * índice global de coincidencia dentro de la página para marcar la activa.
 */
function highlight(
  text: string,
  needle: string,
  counter: { value: number },
  activeIndex: number | null,
): ReactNode {
  if (needle.length === 0) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  while (true) {
    const at = lower.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) parts.push(text.slice(from, at));
    const isActive = counter.value === activeIndex;
    parts.push(
      <mark
        key={`${at}-${counter.value}`}
        data-active-match={isActive || undefined}
        className={cn(
          'rounded-[3px] px-0.5 font-semibold',
          isActive ? 'bg-primary text-fg-inv' : 'bg-primary-100 text-primary-700',
        )}
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    counter.value += 1;
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

function PageStateBadge({ page }: Readonly<{ page: ManualDetailPage }>) {
  if (page.ocr_status === 'failed') {
    return (
      <Badge tone="error" icon={<X strokeWidth={2.4} />}>
        Falló
      </Badge>
    );
  }
  if (page.text_source === 'user_edit') {
    return (
      <Badge tone="neutral" icon={<Pencil strokeWidth={2} />}>
        Editado a mano
      </Badge>
    );
  }
  if (page.text_quality === 'low_confidence') {
    return (
      <Badge tone="warning" icon={<AlertTriangle strokeWidth={2} />}>
        Poco clara
      </Badge>
    );
  }
  return (
    <Badge tone="success" icon={<Check strokeWidth={2.4} />}>
      OK
    </Badge>
  );
}

/**
 * Cuerpo de una página del manual: cabecera con estado, aviso de baja
 * confianza con re-proceso puntual, texto con resaltado de búsqueda y modo
 * edición (solo manuales privados).
 */
export function PageTextCard({
  page,
  pageCount,
  needle,
  activeMatch,
  editable,
  editing,
  busy,
  saving,
  reprocessing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onReprocessPage,
}: Readonly<{
  page: ManualDetailPage;
  pageCount: number;
  needle: string;
  /** Índice (dentro de la página) de la coincidencia activa, si cae aquí. */
  activeMatch: number | null;
  editable: boolean;
  editing: boolean;
  /** El manual está re-procesándose: edición deshabilitada. */
  busy: boolean;
  saving: boolean;
  reprocessing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (text: string) => void;
  onReprocessPage: () => void;
}>) {
  const [draft, setDraft] = useState('');
  const draftId = useId();
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const paragraphs = useMemo(() => pageParagraphs(page), [page]);
  const counter = { value: 0 };

  // Foco manual al entrar en edición (autoFocus lo veta jsx-a11y).
  useEffect(() => {
    if (editing) draftRef.current?.focus();
  }, [editing]);

  function startEditing(): void {
    setDraft(pageText(page));
    onStartEdit();
  }

  const draftLength = draft.length;
  const draftValid = draft.trim().length > 0 && draftLength <= PAGE_TEXT_MAX;

  return (
    <article aria-label={`Página ${page.page_number} de ${pageCount}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="mono rounded-full bg-fg px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-fg-inv">
          PÁGINA {page.page_number} / {pageCount}
        </span>
        <PageStateBadge page={page} />
        {!editing && editable ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={startEditing}
            disabled={busy}
            className="ml-auto"
          >
            <Pencil size={15} strokeWidth={2} />
            Editar texto
          </Button>
        ) : null}
      </div>

      {page.text_quality === 'low_confidence' && !editing ? (
        <output className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-warning bg-warning-bg p-4">
          <AlertTriangle size={18} className="shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-fg">
            <strong className="font-semibold">Esta página se leyó con baja confianza.</strong> La
            foto salió borrosa y puede haber palabras mal leídas: corrígelas a mano o re-procesa la
            página.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={onReprocessPage}
            loading={reprocessing}
            disabled={busy}
          >
            <RotateCw size={14} strokeWidth={2} />
            Re-procesar página
          </Button>
        </output>
      ) : null}

      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (draftValid) onSave(draft);
          }}
        >
          <label htmlFor={draftId} className="sr-only">
            Texto de la página {page.page_number}
          </label>
          <Textarea
            id={draftId}
            ref={draftRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={Math.min(Math.max(draft.split('\n').length + 2, 10), 24)}
            disabled={saving}
            spellCheck
            className="font-body"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p
              className={cn(
                'mono mr-auto text-[11px]',
                draftLength > PAGE_TEXT_MAX ? 'font-bold text-error' : 'text-fg-3',
              )}
              aria-live="polite"
            >
              {draftLength.toLocaleString('es')} / {PAGE_TEXT_MAX.toLocaleString('es')}
            </p>
            <Button variant="ghost" size="sm" onClick={onCancelEdit} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={saving} disabled={!draftValid}>
              Guardar texto
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg-3">
            Esto sustituye lo que leyó el OCR: la IA responderá usando tu texto.
          </p>
        </form>
      ) : (
        <Card className="select-text bg-surface px-6 py-5 md:px-7 md:py-6">
          {paragraphs.length === 0 ? (
            <p className="text-sm text-fg-3">
              No hay texto legible en esta página. Puedes escribirlo a mano con «Editar texto» o
              re-procesarla.
            </p>
          ) : (
            <div className="flex flex-col gap-3.5">
              {paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`} className="break-words text-[15px] leading-7 text-fg">
                  {highlight(paragraph, needle, counter, activeMatch)}
                </p>
              ))}
            </div>
          )}
        </Card>
      )}
    </article>
  );
}
