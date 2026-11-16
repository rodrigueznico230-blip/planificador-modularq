# Planificador multi-proyecto · ModulArq

Programa la fabricación de varios proyectos de construcción modular a la vez y muestra cuándo termina cada uno, cómo se reparten las cargas entre operarios y estaciones, y dónde está el cuello de botella.

## Qué hace

- **Programa** cada unidad en intervalos de 15 minutos hábiles respetando precedencias, capacidad de estaciones, especialidades, cuadrillas mínima y máxima, disponibilidad de cada operario y esperas de curado o secado.
- **Resumen** con el estado de cada proyecto contra su compromiso, alertas y ocupación de estaciones.
- **Gantt** por proyecto (con tareas), por estación y por operario.
- **Carga de operarios** por día o semana, por persona y por especialidad.
- **Equilibrado** por estación (Yamazumi): takt time, tiempo de ciclo, operarios mínimos y eficiencia.
- **Cuadrillas**: equipos de 3 operarios asignados a proyectos o lotes; reparto de las tareas de cada modelo entre los puestos Operario 1, 2 y 3 (Yamazumi por operario y por estación, eficiencia de balanceo) y hoja de procedimiento diario imprimible por operario.
- **Datos editables**: proyectos, modelos y tareas, operarios, estaciones y calendario.
- **Nube**: con una cuenta de ModulArq, el plan se guarda en Supabase y se comparte. Administradores editan; operarios ven en modo lectura. Los cambios de otra persona llegan en tiempo real y los conflictos se resuelven a elección.

El modelo *Planta libre* reproduce la secuencia del proyecto Vicuña 3PL de `modularq-procesos` (68 tareas, 10 etapas). Sus tiempos están vacíos a propósito: se cargan en **Modelos y tareas**.

## Estructura

```
src/
  engine.js    motor de programación (función pura, sin dependencias)
  app.js       interfaz
  crews-view.js  apartado Cuadrillas (se inserta en app.js al compilar)
  cloud.js     inicio de sesión y sincronización con Supabase
  sample.js    datos de ejemplo
  config.js    URL y clave publicable de Supabase
  shell.html   página base
scripts/build.mjs        build de producción (HTML liviano + assets con hash)
supabase/migrations/     tabla public.planner_plans, RLS y Realtime
test/engine.test.mjs     pruebas del motor
```

## Uso local

```bash
npm install
npm test
npm run build        # dist/index.html + dist/assets/, con nube
npm run build:local  # dist/local.html autocontenido, solo navegador
```

## Velocidad de carga

- `index.html` (~10 KB comprimido) trae el CSS en línea y precarga la fuente y el script principal.
- `assets/app.<hash>.js` (~29 KB comprimido) contiene el motor y la interfaz, minificados.
- `assets/cloud.<hash>.js` (Supabase, ~31 KB comprimido) se descarga recién cuando la app ya está en pantalla.
- La fuente Inter se sirve desde el mismo dominio (sin Google Fonts) y todo `/assets/` se guarda en caché por un año.
- Con sesión iniciada, la app muestra al instante la última copia del plan y solo descarga el plan completo si cambió la versión en la nube.

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

### Datos importados de modularq-procesos

`supabase/importar-desde-procesos.sql` arma el plan con los 10 formatos de la app de procesos (más el flujo de DTS, cuyo modelo no tiene formato) y los 8 proyectos activos. Cada fase pasa a ser una estación, se omiten planos, acopios y bases de hormigón (no ocupan la planta) y las precedencias se conservan saltando esos pasos. Los tiempos quedan vacíos para cargarlos en **Modelos y tareas**.

La clave de `src/config.js` es la clave **publicable**: es segura en el navegador porque el acceso lo controlan las políticas RLS.
