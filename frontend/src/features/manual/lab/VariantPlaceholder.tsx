/** Hueco de variante pendiente de la fase de divergencia. */
export function VariantPlaceholder({ name }: Readonly<{ name: string }>) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-8 py-6 text-center">
        <p className="font-display text-lg font-bold text-fg">{name}</p>
        <p className="mt-1 text-sm text-fg-2">Se construye en la fase de divergencia.</p>
      </div>
    </div>
  );
}
