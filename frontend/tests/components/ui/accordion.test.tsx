import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

function Sample({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? 'a' : undefined}>
      <AccordionItem value="a">
        <AccordionTrigger>Sección A</AccordionTrigger>
        <AccordionContent>Contenido A</AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger>Sección B</AccordionTrigger>
        <AccordionContent>Contenido B</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

describe('Accordion', () => {
  it('inicialmente colapsado, no muestra contenido', () => {
    render(<Sample />);
    expect(screen.queryByText('Contenido A')).not.toBeInTheDocument();
  });

  it('al pulsar el trigger expande la sección', async () => {
    const user = userEvent.setup();
    render(<Sample />);
    await user.click(screen.getByRole('button', { name: 'Sección A' }));
    expect(screen.getByText('Contenido A')).toBeInTheDocument();
  });

  it('en modo single, abrir B cierra A', async () => {
    const user = userEvent.setup();
    render(<Sample defaultOpen />);
    expect(screen.getByText('Contenido A')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sección B' }));
    expect(screen.queryByText('Contenido A')).not.toBeInTheDocument();
    expect(screen.getByText('Contenido B')).toBeInTheDocument();
  });

  it('triggers son operables con teclado (Space/Enter)', async () => {
    const user = userEvent.setup();
    render(<Sample />);
    const trigger = screen.getByRole('button', { name: 'Sección A' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Contenido A')).toBeInTheDocument();
  });

  it('pasa axe a11y abierto y cerrado', async () => {
    const { container, rerender } = render(<Sample />);
    expect(await axe(container)).toHaveNoViolations();
    rerender(<Sample defaultOpen />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
