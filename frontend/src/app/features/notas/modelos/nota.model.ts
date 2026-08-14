/** Ver esquema completo en .claude/skills/sistema-academico/references/base-datos.md */
export interface Nota {
  id: number;
  estudianteId: string;
  profesorMateriaId: number;
  valor: number; // 0..5
  creadoPor: string;
  creadoEn: string;
  modificadoPor: string | null;
  modificadoEn: string | null;
}
