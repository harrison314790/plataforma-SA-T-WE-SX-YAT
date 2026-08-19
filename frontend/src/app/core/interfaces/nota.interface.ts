/**
 * Ver esquema real en backend/01-esquema-inicial_1.sql y
 * .claude/skills/sistema-academico/references/base-datos.md
 */
export interface Nota {
  id: string;
  estudianteId: string;
  asignacionId: string;
  valor: number; // 1.0..5.0
  enRevision: boolean;
  registradoPor: string;
  createdAt: string;
  updatedAt: string;
}
