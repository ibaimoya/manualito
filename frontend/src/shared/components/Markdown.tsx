import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/shared/lib/cn';

/**
 * Renderiza el Markdown que devuelve el LLM (negritas, listas, tablas, código…).
 * react-markdown no inyecta HTML crudo y sanea las URLs por defecto, así que es
 * seguro frente a contenido del modelo. El estilo vive en la clase ".md"
 * (globals.css): compacto y hereda el color del contenedor (burbuja/tarjeta).
 */
export function Markdown({
  children,
  className,
}: Readonly<{ children: string; className?: string }>) {
  return (
    <div className={cn('md', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
