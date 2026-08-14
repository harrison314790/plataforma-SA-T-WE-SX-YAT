# plataforma-SA-T-WE-SX-YAT

Sistema de gestión académica para una institución educativa de un
resguardo indígena en Colombia (sede principal + escuelas satélite en
veredas). Primer módulo: **notas** (calificaciones).

Las decisiones de arquitectura, seguridad y diseño de este proyecto están
documentadas como skill de Claude Code en
[`.claude/skills/sistema-academico/`](.claude/skills/sistema-academico/SKILL.md) —
léela antes de tocar código, ahí está el porqué de cada convención de este
repo (las tres capas de seguridad, el modelo de permisos dinámicos, el
sistema de diseño, etc.).

## Estructura

```
frontend/   Angular 18+ (standalone components, signals)
backend/    Node + Express (API intermedia, obligatoria para toda escritura)
```

Base de datos, autenticación y almacenamiento: Supabase (Postgres +
Supabase Auth + Storage), plan Free.

## Cómo arrancar

1. Crear un proyecto en [supabase.com](https://supabase.com), correr las
   migraciones descritas en
   [`references/base-datos.md`](.claude/skills/sistema-academico/references/base-datos.md)
   (tablas + políticas RLS), y sembrar `roles`/`recursos`/`permisos`
   según [`references/permisos.md`](.claude/skills/sistema-academico/references/permisos.md).
2. `backend/`: copiar `.env.example` a `.env` y completar con las llaves
   del proyecto de Supabase. Luego:
   ```
   cd backend
   npm install
   npm run dev
   ```
3. `frontend/`:
   ```
   cd frontend
   npm install
   npm start
   ```

El login (`/login`) y el guardado de sesión/permisos ya están cableados
de punta a punta. La tabla de notas (`frontend/src/app/features/notas/`)
y sus endpoints (`backend/src/rutas/notas.routes.js` y los archivos que
importa) están marcados con `TODO` — son el trabajo que sigue.
