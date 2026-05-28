import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Card y sus subcomponentes son `forwardRef`-wrappers.  Cubrimos:
 *  - Que renderizan el tag HTML correcto (div / h3 / p).
 *  - Que aceptan className extra y la mezclan con las clases base.
 *  - Que el ref se reenvía al nodo subyacente (contrato de forwardRef).
 */
describe('Card primitives', () => {
  it('Card: render div con border-radius y reenvía ref', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <Card ref={ref} className="extra-card" data-testid="card">
        contenido
      </Card>,
    );
    const node = container.firstElementChild as HTMLDivElement;
    expect(node.tagName).toBe('DIV');
    expect(node.className).toContain('extra-card');
    expect(node.className).toMatch(/rounded-2xl/);
    expect(ref.current).toBe(node);
    expect(node.textContent).toBe('contenido');
  });

  it('CardHeader: render div con gap + reenvía ref + className', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <CardHeader ref={ref} className="head">
        h
      </CardHeader>,
    );
    const node = container.firstElementChild as HTMLDivElement;
    expect(node.tagName).toBe('DIV');
    expect(node.className).toContain('head');
    expect(node.className).toMatch(/gap-1/);
    expect(ref.current).toBe(node);
  });

  it('CardTitle: render h3 + reenvía ref + acepta children', () => {
    const ref = createRef<HTMLHeadingElement>();
    const { container } = render(
      <CardTitle ref={ref} className="title">
        Hola
      </CardTitle>,
    );
    const node = container.firstElementChild as HTMLHeadingElement;
    expect(node.tagName).toBe('H3');
    expect(node.textContent).toBe('Hola');
    expect(node.className).toContain('title');
    expect(ref.current).toBe(node);
  });

  it('CardDescription: render p + reenvía ref + className', () => {
    const ref = createRef<HTMLParagraphElement>();
    const { container } = render(
      <CardDescription ref={ref} className="desc">
        descripción
      </CardDescription>,
    );
    const node = container.firstElementChild as HTMLParagraphElement;
    expect(node.tagName).toBe('P');
    expect(node.className).toContain('desc');
    expect(ref.current).toBe(node);
  });

  it('CardContent: render div con padding + reenvía ref + className', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <CardContent ref={ref} className="body">
        x
      </CardContent>,
    );
    const node = container.firstElementChild as HTMLDivElement;
    expect(node.tagName).toBe('DIV');
    expect(node.className).toContain('body');
    expect(node.className).toMatch(/p-4/);
    expect(ref.current).toBe(node);
  });

  it('CardFooter: render div con flex + reenvía ref + className', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <CardFooter ref={ref} className="foot">
        f
      </CardFooter>,
    );
    const node = container.firstElementChild as HTMLDivElement;
    expect(node.tagName).toBe('DIV');
    expect(node.className).toContain('foot');
    expect(node.className).toMatch(/flex/);
    expect(ref.current).toBe(node);
  });
});
