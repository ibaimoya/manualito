import { useEffect, useEffectEvent, useRef, useState } from 'react';

export function useFileDrop(onFiles: (files: File[]) => void, disabled: boolean) {
  const target = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const receive = useEffectEvent((files: File[]) => {
    if (!disabled) onFiles(files);
  });
  const canDrop = useEffectEvent(() => !disabled);

  useEffect(() => {
    let depth = 0;
    const reset = () => {
      depth = 0;
      setDragging(false);
    };
    const isFile = (event: DragEvent) => event.dataTransfer?.types.includes('Files');
    const isInside = (event: DragEvent) =>
      event.target instanceof Node && target.current?.contains(event.target);
    const enter = (event: DragEvent) => {
      if (!isFile(event)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!isFile(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) reset();
    };
    const over = (event: DragEvent) => {
      if (!isFile(event)) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = isInside(event) && canDrop() ? 'copy' : 'none';
    };
    const drop = (event: DragEvent) => {
      reset();
      if (!isFile(event)) return;
      // Impide que un archivo suelto fuera del destino sustituya la página.
      event.preventDefault();
      if (isInside(event)) receive(Array.from(event.dataTransfer!.files));
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reset();
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('blur', reset);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('blur', reset);
      window.removeEventListener('keydown', escape);
    };
  }, []);

  return { target, dragging };
}
