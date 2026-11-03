# Planificador multi-proyecto · ModulArq

Programa la fabricación de varios proyectos de construcción modular a la vez y muestra cuándo termina cada uno, cómo se reparten las cargas entre operarios y estaciones, y dónde está el cuello de botella.

## Qué hace

- **Programa** cada unidad hora hábil por hora hábil respetando precedencias, capacidad de estaciones, especialidades, cuadrillas mínima y máxima, disponibilidad de cada operario y esperas de curado o secado.
- **Resumen** con el estado de cada proyecto contra su compromiso, alertas y ocupación de estaciones.
- **Gantt** por proyecto (con tareas), por estación y por operario.
- **Carga de operarios** por día o semana, por persona y por especialidad.
- **Equilibrado** por estación (Yamazumi): takt time, tiempo de ciclo, operarios mínimos y eficiencia.
- **Datos editables**: proyectos, modelos y tareas, operarios, estaciones y calendario.
- **Nube**: con una cuenta de ModulArq, el plan se guarda en Supabase y se comparte. Administradores editan; operarios ven en modo lectura. Los cambios de otra persona llegan en tiempo real y los conflictos se resuelven a elección.

El modelo *Planta libre* reproduce la secuencia del proyecto Vicuña 3PL de `modularq-procesos` (68 tareas, 10 etapas). Sus tiempos están vacíos a propósito: se cargan en **Modelos y tareas**.

## Estructura

```
src/
  engine.js    motor de programación (función pura, sin dependencias)
  app.js       interfaz
  cloud.js     inicio de sesión y sincronización con Supabase
  sample.js    datos de ejemplo
  config.js    URL y clave publicable de Supabase
  shell.html   página base
scripts/build.mjs        arma un único HTML en dist/
supabase/migrations/     tabla public.planner_plans, RLS y Realtime
test/engine.test.mjs     pruebas del motor
```

## Uso local

```bash
npm install
npm test
npm run build        # dist/index.html, con nube
npm run build:local  # dist/local.html, solo navegador
```

## Publicar

El repositorio está listo para Vercel (`vercel.json`): comando `npm run build`, carpeta `dist`.

## Supabase

Usa el proyecto **modularq** (`ptehldwrmwaigvhgpiwk`) y sus cuentas, perfiles y funciones `private.is_admin()` / `private.is_member()`.

| Rol | Puede |
| --- | --- |
| admin | ver, crear y editar el plan |
| operario | ver el plan |
| pendiente o bloqueado | nada |

El plan vive en la fila `principal` de `public.planner_plans`. La columna `version` aumenta en cada guardado y evita que una edición pise a otra sin aviso. La primera vez que un administrador ingresa, la app crea esa fila con los datos que tenga en pantalla.

La clave de `src/config.js` es la clave **publicable**: es segura en el navegador porque el acceso lo controlan las políticas RLS.
