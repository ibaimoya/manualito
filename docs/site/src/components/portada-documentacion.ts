export const RUTA_INTRODUCCION = '/memoria/introduccion/';
export const RUTA_PLAN_PROYECTO = '/anexos/plan-de-proyecto-software/';

export interface EntradaDocumento {
  indice: string;
  etiqueta: string;
  titulo: string;
  enlace: string;
}

export const memoria: EntradaDocumento[] = [
  {
    indice: '01',
    etiqueta: 'Capítulo 1',
    titulo: 'Introducción',
    enlace: RUTA_INTRODUCCION,
  },
  {
    indice: '02',
    etiqueta: 'Capítulo 2',
    titulo: 'Objetivos del proyecto',
    enlace: '/memoria/objetivos-del-proyecto/',
  },
  {
    indice: '03',
    etiqueta: 'Capítulo 3',
    titulo: 'Conceptos teóricos',
    enlace: '/memoria/conceptos-teoricos/',
  },
  {
    indice: '04',
    etiqueta: 'Capítulo 4',
    titulo: 'Técnicas y herramientas',
    enlace: '/memoria/tecnicas-y-herramientas/',
  },
  {
    indice: '05',
    etiqueta: 'Capítulo 5',
    titulo: 'Aspectos relevantes del desarrollo del proyecto',
    enlace: '/memoria/aspectos-relevantes-del-desarrollo-del-proyecto/',
  },
  {
    indice: '06',
    etiqueta: 'Capítulo 6',
    titulo: 'Trabajos relacionados',
    enlace: '/memoria/trabajos-relacionados/',
  },
  {
    indice: '07',
    etiqueta: 'Capítulo 7',
    titulo: 'Conclusiones y Líneas de trabajo futuras',
    enlace: '/memoria/conclusiones-y-lineas-de-trabajo-futuras/',
  },
];

export const anexos: EntradaDocumento[] = [
  {
    indice: 'A',
    etiqueta: 'Anexo A',
    titulo: 'Plan de Proyecto Software',
    enlace: RUTA_PLAN_PROYECTO,
  },
  {
    indice: 'B',
    etiqueta: 'Anexo B',
    titulo: 'Especificación de Requisitos',
    enlace: '/anexos/especificacion-de-requisitos/',
  },
  {
    indice: 'C',
    etiqueta: 'Anexo C',
    titulo: 'Especificación de diseño',
    enlace: '/anexos/especificacion-de-diseno/',
  },
  {
    indice: 'D',
    etiqueta: 'Anexo D',
    titulo: 'Documentación técnica de programación',
    enlace: '/anexos/documentacion-tecnica-de-programacion/',
  },
  {
    indice: 'E',
    etiqueta: 'Anexo E',
    titulo: 'Documentación de usuario',
    enlace: '/anexos/documentacion-de-usuario/',
  },
  {
    indice: 'F',
    etiqueta: 'Anexo F',
    titulo: 'Sostenibilización curricular',
    enlace: '/anexos/anexo-de-sostenibilizacion-curricular/',
  },
];
