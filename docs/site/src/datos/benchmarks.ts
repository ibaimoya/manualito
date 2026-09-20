import datos from './benchmarks.json';

export type TipoBenchmark = 'ocr' | 'recuperacion' | 'modelos';

export interface Metrica {
  titulo: string;
  maximo: number;
  decimales: number;
  unidad: string;
}

export interface Panel {
  titulo: string;
  metricas: Metrica[];
  filas: { nombre: string; valores: number[]; destacado: boolean }[];
}

const nombres: Record<string, string> = {
  'llama3.1:8b': 'Llama 3.1 8B',
  'qwen3:14b': 'Qwen 3 14B',
  'phi4:14b': 'Phi 4 14B',
  'qwen3.5:9b': 'Qwen 3.5 9B',
  'gemma4:e4b': 'Gemma 4 E4B',
  'gemma4:26b': 'Gemma 4 26B',
  'deepseek-r1:14b': 'DeepSeek-R1 14B',
  'ministral-3:14b': 'Ministral 3 14B',
  'granite3.3:2b': 'Granite 3.3 2B',
  'llama3.2:3b': 'Llama 3.2 3B',
  'phi4-mini:3.8b': 'Phi 4 Mini 3.8B',
  'qwen3:0.6b': 'Qwen 3 0.6B',
  'qwen3:1.7b': 'Qwen 3 1.7B',
  'llama3.2:1b': 'Llama 3.2 1B',
  'qwen3:4b': 'Qwen 3 4B',
  'gemma3:1b': 'Gemma 3 1B',
  'deepseek-r1:1.5b': 'DeepSeek-R1 1.5B',
  'gemma3:4b': 'Gemma 3 4B',
};
export function panelesBenchmark(tipo: TipoBenchmark): Panel[] {
  const paneles: Panel[] = [];

  if (tipo === 'ocr') {
    const orden = ['PaddleOCR GPU', 'PaddleOCR CPU', 'Tesseract', 'EasyOCR'];
    paneles.push({
      titulo: 'Error y tiempo del reconocimiento',
      metricas: [
        { titulo: 'Error de caracteres', maximo: 25, decimales: 2, unidad: '%' },
        { titulo: 'Tiempo', maximo: 140, decimales: 1, unidad: 's' },
      ],
      filas: orden.map((nombre) => {
        const fila = datos.ocr.find((fila) => fila.motor === nombre)!;
        return { nombre, valores: [fila.error_pct, fila.seconds], destacado: nombre === orden[0] };
      }),
    });
  } else if (tipo === 'recuperacion') {
    paneles.push({
      titulo: 'Fragmento esperado entre los cinco primeros',
      metricas: [{ titulo: 'Preguntas', maximo: 24, decimales: 0, unidad: '/24' }],
      filas: datos.retrieval.map((fila, indice) => ({
        nombre: fila.date.split('-').reverse().join('/'),
        valores: [fila.found],
        destacado: indice === datos.retrieval.length - 1,
      })),
    });
  } else {
    for (const perfil of [
      { titulo: 'Perfil alto', filas: datos.large, maximo: 12, elegido: 'gemma4:e4b' },
      { titulo: 'Perfil bajo', filas: datos.small, maximo: 5, elegido: 'granite3.3:2b' },
    ]) {
      paneles.push({
        titulo: perfil.titulo,
        metricas: [
          { titulo: 'Fidelidad', maximo: 1, decimales: 3, unidad: '' },
          { titulo: 'Memoria gráfica', maximo: perfil.maximo, decimales: 3, unidad: 'GB' },
        ],
        filas: perfil.filas.map((fila) => ({
          nombre: nombres[fila.model],
          valores: [fila.fidelity, fila.memory_gb],
          destacado: fila.model === perfil.elegido,
        })),
      });
    }
  }
  return paneles;
}

export function numero(valor: number, decimales: number) {
  return valor.toLocaleString('es-ES', { maximumFractionDigits: decimales });
}
