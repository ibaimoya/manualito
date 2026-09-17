import type { Config, Driver, PopoverDOM, driver as createDriver } from 'driver.js';
import { toast } from 'sonner';
import i18n from '@/app/i18n';
import { LiveTrans } from '@/shared/components/LiveTrans';
import { storage } from '@/shared/lib/storage';
import { findTourTarget, TOUR_ATTRIBUTE } from './targets';
import { TOURS } from './tours';
import type { TourId, TourSpec, TourStepSpec, TourTarget } from './types';
import { tutorialViews } from './views';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const STEP_TRANSITION_MS = 200;
const TARGET_WAIT_MS = 10_000;
const POPOVER_CLASS = 'mn-tour';
const WATCHED_ATTRIBUTES = [
  TOUR_ATTRIBUTE,
  'class',
  'style',
  'hidden',
  'inert',
  'aria-hidden',
  'data-view',
];
const CLOSE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';

export type TourLocation = Readonly<{ pathname: string; search: string }>;

type ActiveTour = Readonly<{
  id: TourId;
  driver: Driver;
  plan: readonly TourStepSpec[];
  detach: () => void;
}>;

type Highlighted = Readonly<{ index: number; element: Element }>;

// Driver sobrescribe estos atributos y los elimina al retirar el resaltado.
const DRIVER_ARIA: Readonly<Record<string, string>> = {
  'aria-haspopup': 'dialog',
  'aria-expanded': 'true',
  'aria-controls': 'driver-popover-content',
};

type AriaSnapshot = Readonly<{ element: Element; values: ReadonlyMap<string, string> }>;

function snapshotAria(element: Element): AriaSnapshot {
  const values = new Map<string, string>();
  for (const name of Object.keys(DRIVER_ARIA)) {
    const value = element.getAttribute(name);
    if (value !== null) values.set(name, value);
  }
  return { element, values };
}

// Conserva los atributos que React haya actualizado durante el recorrido.
function restoreTarget({ element, values }: AriaSnapshot): void {
  element.classList.remove('driver-active-element', 'driver-no-interaction');
  for (const [name, driverValue] of Object.entries(DRIVER_ARIA)) {
    const current = element.getAttribute(name);
    if (current !== null && current !== driverValue) continue;
    const original = values.get(name);
    if (original !== undefined) element.setAttribute(name, original);
    else if (current !== null) element.removeAttribute(name);
  }
}

function sameLocation(a: TourLocation, b: TourLocation): boolean {
  return a.pathname === b.pathname && a.search === b.search;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function planSteps(spec: TourSpec): readonly TourStepSpec[] | null {
  const views = tutorialViews(spec.id);
  if (spec.steps.some((step) => step.view) && !views?.ready) return null;
  const present = spec.steps.filter((step) => {
    if (step.view === 'compare' && !findTourTarget(step.target)) return false;
    if (step.view && step.optional) return views?.targets[step.view]?.includes(step.target);
    return step.view !== undefined || findTourTarget(step.target) !== undefined;
  });
  const missingRequired = spec.steps.some((step) => !step.optional && !present.includes(step));
  if (missingRequired || present.length === 0) return null;
  if (spec.id === 'library' && views?.value === 'manuals') {
    return [
      ...present.filter((step) => step.view === 'manuals'),
      ...present.filter((step) => step.view === 'games'),
    ];
  }
  return present;
}

function positionTarget(element: HTMLElement, reset: boolean): void {
  if (reset) {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.scrollTop !== 0 || parent.scrollLeft !== 0) {
        parent.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    }
  }
  element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
}

// Driver admite un objetivo ausente, aunque sus tipos exigen Element.
function resolveStepElement(target: TourTarget): Element {
  return findTourTarget(target) as Element;
}

async function loadDriver(): Promise<typeof createDriver> {
  const [module] = await Promise.all([import('driver.js'), import('driver.js/dist/driver.css')]);
  // El tema se carga después para conservar los estilos de Manualito.
  await import('./tour.css');
  return module.driver;
}

function notifyUnavailable(): void {
  toast.warning(<LiveTrans ns="tutorial" i18nKey="unavailable.title" />, {
    id: 'tutorial-unavailable',
    description: <LiveTrans ns="tutorial" i18nKey="unavailable.description" />,
  });
}

function decoratePopover(popover: PopoverDOM, closeLabel: string): void {
  popover.wrapper.setAttribute('aria-modal', 'true');
  popover.closeButton.setAttribute('aria-label', closeLabel);
  popover.closeButton.innerHTML = CLOSE_ICON;
  // Driver enfoca primero la X. El botón principal recibe el foco tras ese render.
  queueMicrotask(() => {
    if (popover.wrapper.isConnected) popover.nextButton.focus();
  });
}

function restoreFocus(origin: HTMLElement | null): void {
  const target = origin?.isConnected ? origin : findTourTarget('nav-help');
  target?.focus({ preventScroll: true });
}

function attachRuntimeListeners(
  driver: Driver,
  onDomChange: () => void,
  advance: (direction: number) => void,
): () => void {
  const media = window.matchMedia(REDUCED_MOTION);
  const onMotionChange = (event: MediaQueryListEvent) => {
    driver.setConfig({ ...driver.getConfig(), animate: !event.matches });
    document.body.classList.toggle('driver-fade', !event.matches);
    document.body.classList.toggle('driver-simple', event.matches);
    driver.refresh();
  };
  // Driver solo escucha window. La app también desplaza paneles internos.
  const onScroll = () => driver.refresh();
  // La API pública permite invertir el paso durante la animación. El manejador nativo ignora esas flechas.
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.stopPropagation();
    advance(event.key === 'ArrowRight' ? 1 : -1);
  };
  let frame = 0;
  const schedule = () => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onDomChange();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: WATCHED_ATTRIBUTES,
  });
  window.addEventListener('resize', schedule);
  window.addEventListener('keyup', onKeyUp, true);
  media.addEventListener('change', onMotionChange);
  document.addEventListener('scroll', onScroll, true);
  return () => {
    observer.disconnect();
    if (frame !== 0) cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('keyup', onKeyUp, true);
    media.removeEventListener('change', onMotionChange);
    document.removeEventListener('scroll', onScroll, true);
  };
}

class TutorialController {
  private generation = 0;
  private active: ActiveTour | null = null;
  private popover: PopoverDOM | null = null;
  private highlighted: Highlighted | null = null;
  private aria: AriaSnapshot | null = null;
  private starting: TourId | null = null;
  private navigation = 0;
  private pendingIndex: number | null = null;
  private restoreView: (() => void) | null = null;
  private cancelWait: (() => void) | null = null;
  private returnFocus: HTMLElement | null = null;
  private location: TourLocation | null = null;
  private origin: TourLocation | null = null;
  private userId: string | null = null;
  private readonly seenInSession = new Set<string>();

  setUser(userId: string | null): void {
    if (userId === this.userId) return;
    this.userId = userId;
    this.close();
  }

  activeTour(): TourId | null {
    return this.active?.id ?? null;
  }

  isSeen(userId: string): boolean {
    return this.seenInSession.has(userId) || storage.isTutorialSeen(userId);
  }

  markSeen(userId: string): void {
    this.seenInSession.add(userId);
    storage.markTutorialSeen(userId);
  }

  autoStart(): void {
    if (this.userId === null || this.active || this.starting) return;
    if (this.isSeen(this.userId)) return;
    this.start('welcome');
  }

  start(id: TourId): void {
    this.close();
    const generation = ++this.generation;
    this.starting = id;
    this.origin = this.location;
    const focused = document.activeElement;
    this.returnFocus = focused instanceof HTMLElement && focused !== document.body ? focused : null;
    void this.run(TOURS[id], generation).catch(() => {
      if (generation === this.generation) this.interrupt();
    });
  }

  onLocationChange(location: TourLocation): void {
    this.location = location;
    const current = this.active?.id ?? this.starting;
    if (current !== null) {
      const left = this.origin
        ? !sameLocation(this.origin, location)
        : !TOURS[current].matches(location.pathname);
      if (left) this.close();
    }
  }

  close(): void {
    this.end(false);
  }

  reset(): void {
    this.close();
    this.userId = null;
    this.location = null;
    this.seenInSession.clear();
  }

  private end(byUser: boolean): void {
    this.cancelWait?.();
    this.generation += 1;
    this.starting = null;
    this.navigation += 1;
    this.pendingIndex = null;
    this.origin = null;
    this.highlighted = null;
    this.popover = null;
    const origin = this.returnFocus;
    this.returnFocus = null;
    const restore = this.restoreView;
    this.restoreView = null;
    restore?.();
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.detach();
    active.driver.destroy();
    const aria = this.aria;
    this.aria = null;
    if (aria) restoreTarget(aria);
    if (byUser) restoreFocus(origin);
  }

  private interrupt(): void {
    this.end(true);
    notifyUnavailable();
  }

  private renderProgress(popover: PopoverDOM, index: number): void {
    const active = this.active;
    if (!active) return;
    const visible = active.plan.filter(
      (step) => (step.view && step.view !== 'compare') || findTourTarget(step.target),
    );
    const step = active.plan[index];
    const current = step ? visible.indexOf(step) + 1 : 0;
    const t = i18n.getFixedT(null, 'tutorial');
    const text = t('progress', { current, total: visible.length });
    // Evita que el observador vuelva a activarse por una escritura idéntica.
    if (popover.progress.textContent !== text) popover.progress.textContent = text;
  }

  private checkHighlightedTarget(): void {
    const active = this.active;
    const shown = this.highlighted;
    if (!active || !shown) return;
    const step = active.plan[shown.index];
    if (!step) return;
    const resolved = findTourTarget(step.target);
    if (resolved === shown.element) {
      if (this.popover) this.renderProgress(this.popover, shown.index);
      return;
    }
    if (resolved !== undefined) {
      active.driver.moveTo(shown.index);
      return;
    }
    if (step.optional) {
      this.advance(1);
      return;
    }
    this.interrupt();
  }

  private async run(spec: TourSpec, generation: number): Promise<void> {
    const ready = await this.waitUntil(() => planSteps(spec) !== null);
    if (generation !== this.generation) return;
    if (!ready) {
      this.starting = null;
      notifyUnavailable();
      return;
    }
    const driver = await loadDriver();
    if (generation !== this.generation) return;
    const plan = planSteps(spec);
    if (plan === null) {
      this.starting = null;
      notifyUnavailable();
      return;
    }
    const views = tutorialViews(spec.id);
    if (views)
      this.restoreView = () => {
        if (tutorialViews(spec.id)) views.select(views.value);
      };
    const first = plan[0];
    if (!first || !(await this.prepareStep(spec.id, first))) {
      if (generation === this.generation) this.interrupt();
      return;
    }
    if (generation !== this.generation) return;
    const target = findTourTarget(first.target);
    if (target) positionTarget(target, true);
    const instance = driver(this.buildConfig(spec, plan));
    this.starting = null;
    this.active = {
      id: spec.id,
      driver: instance,
      plan,
      detach: attachRuntimeListeners(
        instance,
        () => this.checkHighlightedTarget(),
        (direction) => this.advance(direction),
      ),
    };
    instance.drive();
  }

  private waitUntil(ready: () => boolean): Promise<boolean> {
    if (ready()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let frame = 0;
      const finish = (ready: boolean) => {
        observer.disconnect();
        window.removeEventListener('resize', schedule);
        clearTimeout(timer);
        if (frame !== 0) cancelAnimationFrame(frame);
        this.cancelWait = null;
        resolve(ready);
      };
      const check = () => {
        frame = 0;
        if (ready()) finish(true);
      };
      const schedule = () => {
        if (frame === 0) frame = requestAnimationFrame(check);
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: WATCHED_ATTRIBUTES,
      });
      window.addEventListener('resize', schedule);
      const timer = setTimeout(() => finish(false), TARGET_WAIT_MS);
      this.cancelWait = () => finish(false);
    });
  }

  private async prepareStep(id: TourId, step: TourStepSpec): Promise<boolean> {
    if (!step.view) return findTourTarget(step.target) !== undefined;
    tutorialViews(id)?.select(step.view);
    return this.waitUntil(
      () =>
        (!step.view || tutorialViews(id)?.value === step.view) &&
        findTourTarget(step.target) !== undefined,
    );
  }

  private advance(direction: number): void {
    const active = this.active;
    if (!active) return;
    const index = (this.pendingIndex ?? active.driver.getActiveIndex() ?? 0) + direction;
    if (index < 0) return;
    if (index >= active.plan.length) {
      this.end(true);
      return;
    }
    this.cancelWait?.();
    const navigation = ++this.navigation;
    this.highlighted = null;
    void this.moveTo(active, index, navigation, direction);
  }

  private async moveTo(
    active: ActiveTour,
    index: number,
    navigation: number,
    direction: number,
  ): Promise<void> {
    const step = active.plan[index];
    if (!step) {
      this.end(true);
      return;
    }
    if (step.optional && (!step.view || step.view === 'compare') && !findTourTarget(step.target)) {
      await this.moveTo(active, index + direction, navigation, direction);
      return;
    }
    this.pendingIndex = index;
    const ready = await this.prepareStep(active.id, step);
    if (active !== this.active || navigation !== this.navigation) return;
    if (!ready) {
      this.interrupt();
      return;
    }
    const target = findTourTarget(step.target);
    if (target) positionTarget(target, false);
    active.driver.moveTo(index);
    this.pendingIndex = null;
  }

  private buildConfig(spec: TourSpec, plan: readonly TourStepSpec[]): Config {
    const t = i18n.getFixedT(null, 'tutorial');
    const reducedMotion = window.matchMedia(REDUCED_MOTION).matches;
    const dark = document.documentElement.classList.contains('theme-dark');
    let firstStepShown = false;
    return {
      steps: plan.map((step) => ({
        element: () => resolveStepElement(step.target),
        skipMissingElement: step.optional === true,
        popover: {
          title: escapeHtml(t(step.title)),
          description: escapeHtml(t(step.description)),
          side: step.side,
          align: step.align ?? 'start',
        },
      })),
      animate: !reducedMotion,
      duration: STEP_TRANSITION_MS,
      // El scroll suave movía el globo bajo el cursor y hacía que el clic cayese en el fondo.
      smoothScroll: false,
      allowClose: true,
      // El fondo permite salir cuando el globo ya está colocado. Escape y la X siguen disponibles.
      overlayClickBehavior: () => {
        if (this.highlighted !== null) this.end(true);
      },
      overlayColor: dark ? '#000000' : '#1f1611',
      overlayOpacity: dark ? 0.62 : 0.5,
      stagePadding: 6,
      stageRadius: 12,
      popoverOffset: 10,
      popoverClass: POPOVER_CLASS,
      disableActiveInteraction: true,
      allowKeyboardControl: true,
      showButtons: ['next', 'previous', 'close'],
      showProgress: true,
      onNextClick: () => this.advance(1),
      onPrevClick: () => this.advance(-1),
      nextBtnText: escapeHtml(t('actions.next')),
      prevBtnText: escapeHtml(t('actions.previous')),
      doneBtnText: escapeHtml(t('actions.done')),
      // Los hooks se ejecutan dentro de la transición de Driver. El cierre se aplaza para no interrumpir su limpieza.
      onHighlightStarted: (element, _step, options) => {
        this.highlighted = null;
        if (element === undefined) {
          queueMicrotask(() => {
            if (this.active?.driver === options.driver) this.interrupt();
          });
          return;
        }
        if (this.aria?.element === element) return;
        const previous = this.aria;
        this.aria = snapshotAria(element);
        if (previous) queueMicrotask(() => restoreTarget(previous));
      },
      onHighlighted: (element, _step, options) => {
        if (element === undefined || options.index === undefined) return;
        this.highlighted = { index: options.index, element };
        queueMicrotask(() => this.checkHighlightedTarget());
      },
      onPopoverRender: (popover, options) => {
        decoratePopover(popover, t('actions.close'));
        this.popover = popover;
        if (options.index !== undefined) this.renderProgress(popover, options.index);
        if (options.index !== 0 || firstStepShown) return;
        firstStepShown = true;
        if (spec.id === 'welcome' && this.userId !== null) this.markSeen(this.userId);
      },
      // Driver delega todos los cierres del usuario en este hook.
      onDestroyStarted: () => this.end(true),
    };
  }
}

export const tutorial = new TutorialController();
