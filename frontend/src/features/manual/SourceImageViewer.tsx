import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { ImagesIcon, CircleNotchIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import type { ManualDetailPage } from '@/shared/api/client';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/cn';
import { ViewerControlGlyph, type ViewerControlKind } from './ViewerControlGlyph';
import controlMotion from './viewer-control-motion.module.css';

type SourceImageViewerProps = Readonly<{
  imageUrl: string;
  title: string;
  page: ManualDetailPage;
}>;

type FitMode = 'page' | 'width' | 'custom';
type ImageState = 'loading' | 'ready' | 'error';

const MIN_SCALE = 0.01;
const MAX_SCALE = 4;
const ZOOM_FACTOR = 1.2;
const ZOOM_DURATION = 180;

/** El marco conserva su tamaño. Solo la imagen participa en los gestos de zoom. */
export function SourceImageViewer(props: SourceImageViewerProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
      {/* Una página nueva cancela los gestos y las cargas de la sesión anterior. */}
      <SourceImageSession
        key={`${props.imageUrl}:${props.page.page_number}:${props.page.image_available}`}
        {...props}
      />
    </div>
  );
}

function SourceImageSession({ imageUrl, title, page }: SourceImageViewerProps) {
  const { t } = useTranslation('manual');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const controls = useRef<ReactZoomPanPinchRef>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [imageState, setImageState] = useState<ImageState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>('page');
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const ready = page.image_available && imageState === 'ready';
  const duration = reducedMotion ? 0 : ZOOM_DURATION;

  function fitImage(mode: Exclude<FitMode, 'custom'>, animationTime = duration) {
    const viewer = controls.current;
    if (!viewer) return;
    setFitMode(mode);
    if (mode === 'page') {
      void viewer.fitToView({ maxScale: 1, animationTime, animationType: 'easeOutCubic' });
      return;
    }
    const wrapper = viewer.instance.wrapperComponent;
    const content = viewer.instance.contentComponent;
    if (!wrapper || !content?.offsetWidth) return;
    const nextScale = Math.min(MAX_SCALE, wrapper.clientWidth / content.offsetWidth);
    const top = Math.max(0, (wrapper.clientHeight - content.offsetHeight * nextScale) / 2);
    void viewer.setTransform(0, top, nextScale, animationTime, 'easeOutCubic');
  }

  function zoomTo(nextScale: number, point?: { clientX: number; clientY: number }) {
    const viewer = controls.current;
    const wrapper = viewer?.instance.wrapperComponent;
    if (!viewer || !wrapper || !ready) return;
    const rect = wrapper.getBoundingClientRect();
    setFitMode('custom');
    void viewer.zoomToPoint(
      Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale)),
      point?.clientX ?? rect.left + rect.width / 2,
      point?.clientY ?? rect.top + rect.height / 2,
      duration,
      'easeOutCubic',
    );
  }

  function stepZoom(direction: 'in' | 'out') {
    const currentScale = controls.current?.state.scale ?? scale;
    zoomTo(direction === 'in' ? currentScale * ZOOM_FACTOR : currentScale / ZOOM_FACTOR);
  }

  const refitAfterResize = useEffectEvent(() => {
    if (ready && fitMode !== 'custom') fitImage(fitMode, 0);
  });

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => refitAfterResize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!reducedMotion) return;
    const viewer = controls.current;
    if (!viewer) return;
    const { positionX, positionY, scale: currentScale } = viewer.state;
    void viewer.setTransform(positionX, positionY, currentScale, 0);
  }, [reducedMotion]);

  const canvasProps = {
    'data-image-canvas': '',
    role: 'region',
    'aria-label': t('image.keyboardHint'),
    tabIndex: ready ? 0 : -1,
    onDoubleClick: (event: MouseEvent<HTMLDivElement>) =>
      zoomTo((controls.current?.state.scale ?? scale) * 1.5, event),
    onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (['+', '=', '-', '_'].includes(event.key)) setFitMode('custom');
      if (event.key === '0') {
        event.preventDefault();
        event.stopPropagation();
        fitImage('page');
      }
    },
  };

  return (
    <>
      <fieldset
        aria-label={t('image.controls')}
        className="m-0 flex h-14 min-w-0 shrink-0 items-center justify-center gap-0.5 border-0 border-b border-border bg-bg px-2 py-0"
      >
        <ZoomControl
          kind="zoom-out"
          label={t('image.zoomOut')}
          disabled={!ready || scale <= MIN_SCALE}
          onClick={() => stepZoom('out')}
        />
        <output
          aria-label={t('image.zoomValue')}
          aria-live="off"
          className="w-14 text-center font-mono text-xs font-medium tabular-nums text-fg"
        >
          {ready ? `${Math.round(scale * 100)}%` : '…'}
        </output>
        <ZoomControl
          kind="zoom-in"
          label={t('image.zoomIn')}
          disabled={!ready || scale >= MAX_SCALE}
          onClick={() => stepZoom('in')}
        />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <ZoomControl
          kind="fit-page"
          label={t('image.fitPage')}
          pressed={fitMode === 'page'}
          disabled={!ready}
          onClick={() => fitImage('page')}
        />
        <ZoomControl
          kind="fit-width"
          label={t('image.fitWidth')}
          pressed={fitMode === 'width'}
          disabled={!ready}
          onClick={() => fitImage('width')}
        />
        <ZoomControl
          kind="actual-size"
          label={t('image.actualSize')}
          disabled={!ready}
          onClick={() => zoomTo(1)}
        />
      </fieldset>

      <div
        ref={viewport}
        className="relative min-h-0 flex-1 overflow-hidden p-4 sm:p-6"
        data-testid="manual-image-viewport"
        aria-busy={page.image_available && imageState === 'loading'}
      >
        {page.image_available ? (
          <TransformWrapper
            ref={controls}
            minScale={MIN_SCALE}
            maxScale={MAX_SCALE}
            fitOnInit
            centerZoomedOut
            disablePadding
            disabled={imageState === 'error'}
            wheel={{ wheelDisabled: true, step: scale * 0.002 }}
            trackPadPanning={{ disabled: false, velocityDisabled: true }}
            panning={{ velocityDisabled: true }}
            pinch={{ allowPanning: true }}
            doubleClick={{ disabled: true }}
            zoomAnimation={{ disabled: reducedMotion, animationTime: duration }}
            autoAlignment={{ animationTime: duration, velocityAlignmentTime: duration }}
            velocityAnimation={{ disabled: true }}
            keyboard={{
              disabled: false,
              zoomStep: scale * 0.2,
              animationTime: duration,
              animationType: 'easeOutCubic',
            }}
            onTransform={(_, state) => setScale(state.scale)}
            onWheelStart={() => setFitMode('custom')}
            onPinchStart={() => setFitMode('custom')}
            onPanningStart={() => setDragging(true)}
            onPanningStop={() => setDragging(false)}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: 'max-content', height: 'max-content' }}
              wrapperClass={cn(
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                ready && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
              )}
              wrapperProps={canvasProps}
            >
              <img
                key={attempt}
                src={imageUrl}
                alt={t('image.alt', { pageNumber: page.page_number, title })}
                width={page.image_width ?? undefined}
                height={page.image_height ?? undefined}
                draggable={false}
                decoding="async"
                className={cn(
                  'block max-w-none select-none bg-white shadow-sm outline -outline-offset-1 outline-black/10 dark:outline-white/10',
                  !ready && 'invisible',
                )}
                onLoad={() => {
                  setImageState('ready');
                  fitImage('page', 0);
                }}
                onError={() => setImageState('error')}
              />
            </TransformComponent>
          </TransformWrapper>
        ) : null}

        <ImageFeedback
          available={page.image_available}
          state={imageState}
          onRetry={() => {
            setImageState('loading');
            setAttempt((value) => value + 1);
          }}
        />
      </div>
    </>
  );
}

function ImageFeedback({
  available,
  state,
  onRetry,
}: Readonly<{
  available: boolean;
  state: ImageState;
  onRetry: () => void;
}>) {
  const { t } = useTranslation('manual');
  if (available && state === 'ready') return null;

  return (
    <div className="absolute inset-0 grid place-items-center bg-surface p-6 text-center">
      {available && state === 'loading' ? (
        <output
          aria-label={t('image.loading')}
          className="flex items-center gap-2 text-sm text-fg-2"
        >
          <CircleNotchIcon size={18} className="motion-safe:animate-spin" aria-hidden="true" />
          {t('image.loading')}
        </output>
      ) : (
        <div className="max-w-xs">
          <ImagesIcon size={30} className="mx-auto mb-4 text-muted" aria-hidden="true" />
          <p className="text-sm font-semibold text-fg">
            {t(state === 'error' ? 'image.errorTitle' : 'image.missingTitle')}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            {t(state === 'error' ? 'image.errorDescription' : 'image.missingDescription')}
          </p>
          {state === 'error' ? (
            <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
              <ArrowCounterClockwiseIcon
                data-icon-motion="rotate-back"
                aria-hidden="true"
                size={16}
              />
              {t('image.retry')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ZoomControl({
  kind,
  label,
  disabled,
  pressed,
  onClick,
}: Readonly<{
  kind: ViewerControlKind;
  label: string;
  disabled: boolean;
  pressed?: boolean;
  onClick: () => void;
}>) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        data-viewer-control={kind}
        className={cn(
          controlMotion.control,
          'grid size-10 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-35 pointer-coarse:size-11',
          pressed && 'bg-surface text-fg',
        )}
      >
        <ViewerControlGlyph kind={kind} />
      </button>
    </Tooltip>
  );
}
