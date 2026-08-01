export const RUTA_INTRODUCCION = '/memoria/introduccion/';
export const RUTA_PLAN_PROYECTO = '/anexos/plan-de-proyecto-software/';

export interface EntradaDocumento {
  indice: string;
  etiqueta: string;
  titulo: string;
  resumen: string;
  enlace?: string;
}

export const memoria: EntradaDocumento[] = [
  {
    indice: '01',
    etiqueta: 'Capítulo 1',
    titulo: 'Introducción',
    resumen: 'Qué problema resuelve Manualito y por qué merece la pena resolverlo.',
    enlace: RUTA_INTRODUCCION,
  },
  {
    indice: '02',
    etiqueta: 'Capítulo 2',
    titulo: 'Objetivos del proyecto',
    resumen: 'Objetivos generales, técnicos y personales, con su alcance delimitado.',
  },
  {
    indice: '03',
    etiqueta: 'Capítulo 3',
    titulo: 'Conceptos teóricos',
    resumen: 'Reconocimiento óptico de caracteres, recuperación aumentada y modelos de lenguaje.',
  },
  {
    indice: '04',
    etiqueta: 'Capítulo 4',
    titulo: 'Técnicas y herramientas',
    resumen: 'Metodología de trabajo, lenguajes, servicios y decisiones de infraestructura.',
  },
  {
    indice: '05',
    etiqueta: 'Capítulo 5',
    titulo: 'Aspectos relevantes del desarrollo del proyecto',
    resumen: 'Las decisiones que marcaron el proyecto y los problemas que costó resolver.',
  },
  {
    indice: '06',
    etiqueta: 'Capítulo 6',
    titulo: 'Trabajos relacionados',
    resumen: 'Qué existe ya en este terreno y en qué se diferencia esta propuesta.',
  },
  {
    indice: '07',
    etiqueta: 'Capítulo 7',
    titulo: 'Conclusiones y líneas de trabajo futuras',
    resumen: 'Resultados obtenidos y por dónde continuaría el trabajo.',
  },
];

export const anexos: EntradaDocumento[] = [
  {
    indice: 'A',
    etiqueta: 'Anexo A',
    titulo: 'Plan de proyecto',
    resumen: 'Planificación temporal y viabilidad económica y legal.',
    enlace: RUTA_PLAN_PROYECTO,
  },
  {
    indice: 'B',
    etiqueta: 'Anexo B',
    titulo: 'Requisitos',
    resumen: 'Catálogo de requisitos funcionales y no funcionales con sus casos de uso.',
  },
  {
    indice: 'C',
    etiqueta: 'Anexo C',
    titulo: 'Diseño',
    resumen: 'Diseño de datos, arquitectura y procedimientos del sistema.',
  },
  {
    indice: 'D',
    etiqueta: 'Anexo D',
    titulo: 'Manual del programador',
    resumen: 'Estructura del código, entorno de desarrollo, compilación y pruebas.',
  },
  {
    indice: 'E',
    etiqueta: 'Anexo E',
    titulo: 'Manual del usuario',
    resumen: 'Requisitos de instalación y guía de uso de la aplicación.',
  },
  {
    indice: 'F',
    etiqueta: 'Anexo F',
    titulo: 'Objetivos de Desarrollo Sostenible',
    resumen: 'Relación del proyecto con los ODS de la Agenda 2030.',
  },
];
