# Inter Playa Honda · Entrenadores

Primera versión de la aplicación del club, creada con React Native, Expo y TypeScript para Android, iOS y web.

## Estado actual

- Pantalla de acceso por correo/contraseña con Supabase y recuperación de sesión. Sin alta pública desde la app; el club gestiona las cuentas.
- Equipos asignados al entrenador y gestión de jugadores: alta, edición, archivo y restauración. Archivar conserva las asistencias.
- Dorsales únicos entre jugadores activos; errores de validación y guardado visibles.
- Asistencia por fecha con estados presente, ausente o justificado; pendientes separados.
- Pestaña Resumen con estadísticas individuales, porcentaje, filtro por fechas y consulta de jugadores archivados.
- Base de datos y políticas RLS en `supabase/`. Consulta [la guía de conexión](supabase/README.md) para crear las tablas, la primera cuenta y las asignaciones.
- Demo independiente con datos ficticios y persistencia local; no se mezclan sus registros con los del club.

La integración remota requiere configurar la URL, la clave pública y el esquema en tu proyecto Supabase. Las pruebas locales no acreditan que esa conexión ya esté operativa. No introducir datos reales hasta completar la validación remota indicada en la guía.

## Desarrollo

Las copias de seguridad se preparan por separado de la publicación web. [La guía de copias cifradas](supabase/BACKUPS.md) explica los secretos de GitHub, la primera ejecución, su descarga, la programación diaria y el ensayo de recuperación. Incluyen base de datos, cuentas de Auth, imágenes actuales e históricas, permisos y código; no están activadas hasta configurar los secretos y `CLUB_BACKUPS_ENABLED`. El repositorio público solo recibe artifacts cifrados, con conservación de 30 días. Los datos en claro y credenciales no se incorporan al código ni a GitHub Pages.

Node.js 24 LTS y npm. Desde `/workspace/aplicacionInter`:

```sh
npm ci
npm run typecheck
npm test
npm start
```

Abre el proyecto con una versión de Expo Go compatible con el SDK 58 en Android o iOS. El móvil debe poder alcanzar el servidor de desarrollo: el entorno en la nube no garantiza ese acceso. La web publicada puede instalarse desde el navegador como PWA. Para distribuir una aplicación nativa en tiendas serán necesarios builds firmados y las cuentas de distribución. No se han generado ni probado binarios nativos.

Para validar desde el entorno sin móvil:

```sh
EXPO_OFFLINE=1 npm run build
EXPO_OFFLINE=1 npm run web -- --host localhost --port 8081
```

El modo offline de Expo evita consultas auxiliares de metadatos; no desactiva verificaciones TLS ni de paquetes. En este entorno las dependencias se obtienen de `registry.npmjs.org`. No es necesaria ninguna clave para la demostración. El acceso real requiere las variables públicas de `.env.example` y la configuración descrita en `supabase/README.md`.

## Próximas fases acordadas

1. Conectar y validar en el proyecto real las cuentas, equipos y plantillas ya implementados; después, partidos y minutos jugados. Las altas de entrenador se gestionan desde el club.
2. Partidos y registro de minutos de cada jugador.
3. Biblioteca de ejercicios compartida: todos los entrenadores pueden aportar y utilizar ejercicios. Propuesta inicial: cada autor edita sus ejercicios y el administrador gestiona todos.
4. Planificador de sesiones con categorías, duración, material, jugadores y espacio. Cada sesión conservará una copia del ejercicio para que posteriores ediciones no cambien sesiones existentes. Definir las reglas de recursos para ejercicios simultáneos y consecutivos.

El esquema y las políticas están implementados y probados localmente. Su aplicación y validación en Supabase, el panel administrativo dentro de la app y las pruebas en dispositivos físicos quedan pendientes. El nombre e identificadores de aplicación son provisionales; no se ha publicado en ninguna tienda.

## Demostración portátil

La interfaz usa azul y negro como colores del club. La cabecera usa el escudo original del club, conservado sin modificaciones en `assets/club-crest.jpg`. La demo portátil incluye la imagen dentro del HTML y no necesita descargarla de Internet.

En el área del equipo la cabecera ocupa una sola fila compacta con el escudo, el nombre del equipo y **Menú**. El menú reúne el cambio de equipo, **Usuarios del club** para administradores y el cierre de sesión; la lista de equipos ya no ocupa la parte superior de cada pantalla. El resumen del equipo y las pestañas también reducen su espacio vertical para mostrar antes el contenido en móviles.

```sh
npm run demo:build
```

Genera `dist-portable/inter-playa-honda-demo.html`, un único archivo HTML sin recursos externos. Usa los jugadores y reglas de asistencia de `src/domain.ts`; permite probar fechas, alta/edición/archivo/restauración de jugadores y asistencia. Si el visor bloquea almacenamiento, avisa y mantiene las marcas durante la sesión. Es una demostración del flujo, no una aplicación instalada ni un sustituto de la versión Expo.

La exportación de GitHub Pages prepara una web instalable (PWA) con HTTPS, manifiesto, iconos del club y aviso sin conexión. Los datos del club requieren internet; no hay una cola de cambios ni sincronización offline. La demostración portátil de este apartado es un archivo independiente de esa PWA.

## Comprobación descargable del acceso real

```sh
npm run access:build
```

Genera `dist-portable/inter-playa-honda-acceso.html`. Usa únicamente la URL y la clave pública configuradas; incorpora el escudo sin recursos externos. La persona introduce su contraseña en su navegador y esta se envía por HTTPS solo a su proyecto Supabase. Consulta su membresía y equipos, y cierra únicamente la sesión temporal de esa comprobación (`scope=local`). El archivo no escribe contraseñas ni tokens en almacenamiento del navegador y no modifica jugadores ni asistencias. Requiere conexión a Internet; no es la aplicación completa ni una PWA desplegada.

El 6 de noviembre de 2026, desde el entorno restaurado, Supabase respondió HTTP 200 a salud y configuración pública. Las consultas sin sesión a equipos y jugadores fueron rechazadas con HTTP 401 y código PostgreSQL 42501. La comprobación CORS permitió origen de navegador. Esto verifica conectividad, clave pública y rechazo de lecturas anónimas, pero no acredita un inicio de sesión real: la validación de la cuenta requiere que su propietario introduzca su contraseña.

El flujo de este archivo se probó en navegador con respuestas simuladas para acceso correcto, contraseña incorrecta y error al consultar datos, verificando vaciado de contraseña, ausencia de almacenamiento, cierre de sesión y ancho móvil. Las contraseñas de esas pruebas son ficticias.

## Publicación web con GitHub Pages

La preparación usa el repositorio público `emmanueltejero/aplicacionInter`. La dirección prevista, una vez activado y completado el despliegue, es `https://emmanueltejero.github.io/aplicacionInter/`. El código está subido a `main`. La primera ejecución de Actions superó las comprobaciones y la exportación; se detuvo porque Pages todavía no estaba habilitado. La web no se considera publicada hasta que el despliegue finalice correctamente.

`app.config.ts` conserva `app.json` y permite exportar el sitio con la ruta del repositorio mediante `EXPO_BASE_PATH`. Para reproducir el resultado:

```sh
EXPO_OFFLINE=1 npm run build:pages
```

El directorio `dist/` contiene la web y el escudo; `.nojekyll` permite servir los recursos `_expo` y `404.html` proporciona la entrada para rutas. El flujo `.github/workflows/pages.yml` instala, valida, prueba y despliega únicamente `dist`, usando Node 24. Incluye la URL y la clave **Publishable**, que son configuración pública de cliente. No utiliza contraseñas ni credenciales `service_role`; los datos del club permanecen sujetos a los permisos de Supabase.

Antes del primer despliegue, el propietario debe activar **Settings → Pages → Build and deployment → Source: GitHub Actions** en GitHub. Cada subida a `main` activa el flujo de publicación. Si el primer intento falló por Pages deshabilitado, actívalo y repite la ejecución desde Actions o sube un cambio nuevo. Revisar el resultado del flujo y probar el sitio HTTPS real antes de darlo por operativo. La exportación añade el manifiesto y un service worker cuyo único contenido almacenado es el aviso público de conexión.

La publicación del entorno de Codex y la publicación de esta web son operaciones distintas. Los archivos descargables del chat son auxiliares y no se necesitan para usar el sitio alojado.

## Resumen de asistencia

La pestaña **Resumen** usa únicamente los datos del equipo que ya ha autorizado Supabase. No necesita nuevas tablas, migraciones ni permisos. Permite elegir fechas inclusivas, este mes, los últimos 30 días o todo el historial y mostrar/ocultar jugadores archivados. El filtro se conserva al cambiar de pestaña durante la sesión del equipo.

El porcentaje es `presentes / (presentes + ausentes + justificadas) × 100`, sobre los registros completados de cada jugador. Las justificadas cuentan como no asistidas; las fechas futuras y los días sin marcar no entran en el cálculo. No se infieren ausencias a partir del calendario ni de las marcas de otros jugadores. Por eso el porcentaje refleja los datos completados, no una tasa definitiva sobre sesiones pendientes. Un jugador sin registros muestra **Sin datos**, que es distinto de una asistencia registrada del 0%. Se muestran también el número de registros y la explicación del cálculo. Actualmente hay una lista por equipo y día.

`tests/attendance-report.test.mjs` verifica límites de fechas, fechas inválidas, futuros, porcentajes fraccionarios, períodos vacíos, jugadores sin marcar y conservación del historial archivado. La UI se comprobó en navegador con datos ficticios, incluidos filtros y actualización después de pasar lista.

## Partidos y minutos

La pestaña **Partidos** incluye fecha, rival, local/visitante, duración propia, convocatoria y minutos por jugador. Permite crear y editar, y consultar totales por fechas con jugadores archivados. El estado **Partido disputado** controla qué encuentros se contabilizan; las fechas futuras se excluyen siempre. Un `0` es distinto de un campo pendiente.

Para usarlo con las cuentas reales, aplica una vez la [ampliación SQL de partidos](supabase/migrations/202611090002_matches.sql), siguiendo [la guía de Supabase](supabase/README.md#activar-partidos-y-minutos). La demo funciona con almacenamiento local sin ejecutar SQL. El resto de funciones de la cuenta no depende de que esta ampliación esté activada.

Se han probado el flujo de UI y la integración RPC con datos simulados, así como los permisos y las operaciones atómicas en PostgreSQL local. La activación y el guardado real en Supabase requieren la aplicación de la ampliación por el propietario del proyecto.

### Partidos dentro de Resumen

Cada ficha de Resumen reúne ahora la asistencia a entrenamientos y los partidos jugados, minutos totales y media de minutos por partido. El mismo intervalo de fechas y filtro de archivados se aplica a ambos bloques. La media usa los minutos conocidos divididos entre los partidos con minutos positivos; las convocatorias con 0 minutos no aumentan el divisor. Si no hay participaciones con minutos registrados, la media muestra un guion. Los registros pendientes se señalan como cifras provisionales y no se convierten en ceros.

Los partidos se vuelven a cargar al entrar en Resumen, por lo que las ediciones de la pestaña Partidos aparecen al regresar. Si la carga falla, se conserva la asistencia visible y se ofrece reintentar los partidos, sin mostrar estadísticas de partidos ficticiamente a cero. Esta mejora utiliza las tablas ya activadas y no requiere otra migración.

## Corregir y buscar asistencia a entrenamientos

En **Pasar lista**, **Buscar asistencia por fecha** abre un calendario desplegable: elige día, mes y año y pulsa **Usar fecha** para consultar directamente ese día. Se conservan las flechas y el acceso a hoy. La consulta no crea registros. **Quitar marca** devuelve al jugador a **Sin marcar**, actualiza los contadores y lo excluye del cálculo del porcentaje de ese día; las demás fechas y jugadores se conservan. Las marcas de jugadores archivados se mantienen hasta restaurar al jugador.

Para usar **Quitar marca** con las cuentas reales, ejecuta la [ampliación SQL de asistencia](supabase/migrations/202611090003_clear_attendance.sql), siguiendo [la guía de Supabase](supabase/README.md#activar-quitar-marca-en-asistencia). El permiso queda limitado por RLS a los equipos autorizados y jugadores activos. La demo permite probarlo sin SQL. Si el servidor rechaza la operación, la interfaz conserva la marca y muestra el error.

### Selección de fechas sin escribir

La búsqueda de asistencia, **Fecha del partido**, **Fecha del entrenamiento** y **Buscar en el calendario** utilizan el mismo selector. El campo muestra **DD/MM/AAAA** y un botón desplegable; abre un calendario con días, elección de mes y año, navegación y acceso a hoy. **Usar fecha** confirma y **Cancelar fecha** conserva la fecha anterior. En un formulario, elegir una fecha conserva nombre, notas, convocatoria y bloques sin guardarlos hasta confirmar el formulario; en las búsquedas navega al día elegido directamente. Los equipos archivados mantienen sus campos de edición deshabilitados.

El selector usa componentes compartidos de React Native, sin campos de texto ni dependencias nuevas; la web instalable y los clientes nativos usan la misma interfaz. Las fechas siguen guardándose como **AAAA-MM-DD**, con mediodía local para los cálculos, y ajustan correctamente los días al cambiar a meses más cortos o a años no bisiestos. No requiere cambios en Supabase. Las pruebas cubren fechas bisiestas, años completos, cancelación, formularios con borrador, guardado, navegación y cambios de hora; los recorridos web se comprueban con datos ficticios en tamaños móvil y escritorio.

## Biblioteca compartida de ejercicios

La pestaña **Ejercicios** reúne una única biblioteca para todos los miembros activos del club, independientemente de su equipo. También se puede abrir desde **Mis equipos** sin tener un equipo asignado. Permite buscar por nombre, descripción o material, filtrar por categorías, consultar fichas completas y añadir ejercicios. Solo el autor y los administradores pueden editar, archivar o restaurar; archivar conserva la ficha y la oculta del listado habitual.

Cada ejercicio incluye nombre, desarrollo, una o varias categorías, duración (1–240 minutos), mínimo y máximo de jugadores (1–100), largo y ancho del espacio en metros (1–150) y materiales con cantidades (1–1000 por tipo). Puede no requerir material. Los datos estructurados alimentan los planes diarios de la pestaña **Entrenar**.

Para activar la biblioteca con cuentas reales, ejecuta [la ampliación SQL de ejercicios](supabase/migrations/202611100001_exercises.sql), siguiendo [la guía de Supabase](supabase/README.md#activar-la-biblioteca-compartida-de-ejercicios). No modifica plantillas, asistencia ni partidos. Las escrituras pasan por `save_exercise`: comprueba membresía, autoría y contenido en el servidor, asigna el autor autenticado y conserva las revisiones. Una edición antigua se rechaza si hay cambios más recientes; los reintentos idénticos conservan el mismo ejercicio. La UI mantiene el formulario si falla la conexión y permite actualizar la biblioteca para ver aportaciones de otros entrenadores.

La demo incluye dos ejemplos ficticios y guarda sus cambios solo en el dispositivo. Las cuentas reales empiezan sin ejemplos. Se han comprobado validaciones, búsqueda, permisos, revisiones, reintentos y conservación de autoría en PostgreSQL local, y los flujos móviles con almacenamiento local y respuestas simuladas de Supabase. La activación y el guardado real requieren ejecutar el SQL y probar desde una cuenta del club.

### Favoritos personales de ejercicios

Cada entrenador puede marcar **☆ Guardar favorito** en cualquier ejercicio compartido, también en su ficha o al preparar una sesión. La estrella cambia a **★ En mis favoritos** al confirmar el guardado; al pulsarla de nuevo se quita de su selección. El filtro **Mis favoritos** funciona en la biblioteca y en el selector de **Entrenar**, combinado con búsqueda, contenido y categoría del equipo. Los archivados siguen ocultos salvo que se incluyan expresamente en la biblioteca; al restaurar un ejercicio conserva su estrella. Quitar un favorito no modifica las fichas ni los bloques de una sesión.

Para cuentas reales, ejecuta [202611110002_exercise_favorites.sql](supabase/migrations/202611110002_exercise_favorites.sql) en Supabase después de activar la biblioteca. Los favoritos pertenecen a la cuenta, se comparten entre sus dispositivos y equipos y solo los puede leer o cambiar su propietario, incluidos los administradores. La tabla almacena referencias a usuario y ejercicio, sin copiar fichas, imágenes ni vídeos. En la demo se guardan por separado, solo en el dispositivo.

La biblioteca permanece disponible si falta esta ampliación o falla la carga de favoritos. La interfaz muestra el estado pendiente y permite reintentar. Las altas y bajas son explícitas e idempotentes: si se pierde una respuesta, repetir no invierte la selección. Las pruebas verifican aislamiento de cuentas, permisos, reintentos y conservación de datos en PostgreSQL local; los flujos móviles se comprueban con cuentas y respuestas simuladas. La activación y sincronización real requieren aplicar el SQL y comprobarlo desde una cuenta del club.

## Planificación del entrenamiento diario

**Entrenar → Crear entrenamiento** permite elegir una fecha, indicar jugadores previstos y notas, añadir ejercicios activos de la biblioteca, repetirlos como bloques distintos, ordenarlos, quitarlos y ajustar su duración. El cambio de duración pertenece al plan y conserva la ficha de la biblioteca. Admite de 1 a 50 bloques de 1 a 240 minutos, con un total máximo de 600 minutos. Los planes se pueden consultar por fechas, editar, archivar y restaurar. La lista inicial muestra hoy y fechas posteriores; **Todos** incluye el historial. Guardar muestra la fecha del plan recién guardado, aunque sea anterior a hoy.

En la biblioteca del editor, cada ficha añadida se resalta y muestra cuántas veces está en la sesión; su botón cambia a **Añadir otra vez**. Un resumen fijo mantiene a la vista el número de ejercicios y los minutos, con **Ver sesión** para volver a la secuencia. El recuento se actualiza al quitar bloques y al editar planes existentes. Estos cambios están pendientes hasta pulsar **Guardar entrenamiento**.

Los ejercicios son **consecutivos**. El tiempo es la suma de las duraciones y se muestra una secuencia con minutos acumulados. El material es la cantidad máxima de cada tipo a lo largo del plan; se agrupan nombres iguales ignorando mayúsculas y espacios repetidos. No se suman cantidades reutilizables ni se multiplican por grupos. El espacio común usa el largo máximo y el ancho máximo, sin rotación; no suma áreas. El rango común de jugadores es la intersección de los rangos de las fichas. Si no hay intersección o los jugadores previstos no encajan en un bloque, la UI lo indica para que el entrenador prepare grupos y ajuste recursos; el aviso no impide guardar.

Activa las cuentas reales ejecutando la [ampliación de entrenamientos](supabase/migrations/202611100002_training_plans.sql), después de la biblioteca, siguiendo [la guía de Supabase](supabase/README.md#activar-los-planes-de-entrenamiento). Cada plan pertenece a un equipo: solo sus entrenadores asignados y administradores activos pueden leerlo o gestionarlo. Las escrituras son atómicas y verifican la revisión. El servidor guarda copias de las fichas originales, sin confiar en títulos, materiales o espacios enviados por el cliente. Esas copias sobreviven a ediciones o archivos posteriores de la biblioteca. Para actualizar una ficha dentro de un plan, quita su bloque y vuelve a añadirlo desde la biblioteca actualizada.

Los planes pueden seguir editándose con sus bloques guardados si la biblioteca no carga. Los fallos de guardado mantienen el formulario; las ediciones antiguas no sobrescriben versiones recientes y los reintentos idénticos no crean duplicados. Las pruebas cubren los cálculos, filtros, permisos, orden, copias históricas y reintentos en PostgreSQL local y en navegador móvil con datos ficticios y respuestas simuladas. La integración remota real requiere aplicar el SQL y guardar desde una cuenta del club.

### Duplicar para otra fecha

Cada plan tiene **Duplicar para otra fecha**. Permite elegir nombre y fecha y crea un plan independiente, activo, con nuevos identificadores de bloque, revisión 1 y autoría de quien lo duplica. Conserva los jugadores previstos, notas, orden, duraciones y fichas históricas, aunque las fichas de origen hayan cambiado, estén archivadas o ya no existan en la biblioteca. Después se puede editar la copia sin cambiar el original. También se pueden duplicar planes archivados.

Para las cuentas reales, ejecuta [la ampliación SQL de duplicación](supabase/migrations/202611100003_copy_training_plans.sql), después de activar los planes. La función `copy_training_plan` verifica el equipo y la revisión del plan original y construye la copia en el servidor, sin aceptar fichas del cliente. Los reintentos conservan un identificador estable y no duplican planes aunque se pierda la respuesta; una copia ya editada no se sobrescribe. La ampliación añade únicamente procedencia y revisión de origen al plan y la función autorizada; no concede escrituras directas.

### Guardar PDF e imprimir

**Guardar PDF** e **Imprimir** están disponibles en cada plan guardado y dentro de **Ver plan**, incluso si aún no se ha activado la duplicación. Incluyen escudo original, equipo, fecha, título, minutos, jugadores, espacio, material reutilizable, avisos de grupos, secuencia, notas y desarrollo completo de cada ejercicio. Exportan las fichas guardadas del plan, sin volver a leer la biblioteca. No necesitan otra migración ni envían datos a un servicio de conversión externo.

En web, el PDF A4 se genera con jsPDF, tipografías DejaVu incrustadas para el texto en español y páginas numeradas; se descarga con nombre basado en fecha y título. Las tipografías y su licencia están en `assets/fonts`; la publicación incluye `LICENSE-DejaVu.txt`. El módulo PDF y las fuentes se cargan cuando se solicita la exportación. La impresión web prepara un documento con estilos A4 y abre la impresión del navegador. En Android/iOS nativos se utiliza `expo-print` y `expo-sharing` para preparar, guardar/compartir e imprimir. En el navegador móvil, se puede abrir el PDF descargado e imprimir desde su visor si el navegador no ofrece impresión directa.

El documento queda completo en el archivo y se puede consultar sin conexión. Los campos introducidos por entrenadores se tratan como texto y se escapan en el HTML de impresión. Se han probado descarga real en Chromium móvil, texto español, material y tiempos, impresión preparada con datos simulados, 14 páginas sin truncar ejercicios y permisos/reintentos de duplicación en PostgreSQL local. Los diálogos de Android/iOS nativos y la salida en una impresora física requieren comprobación en esos dispositivos.

## Alta de usuarios desde la web

Los administradores activos disponen de **Usuarios del club**, accesible desde **Menú → Usuarios del club** y desde Mis equipos, incluso sin equipos creados. Permite consultar y buscar los miembros del club, crear equipos y dar de alta entrenadores con nombre, correo, contraseña inicial y uno o varios equipos. Desde **Equipos y acceso** también pueden cambiar los equipos y activar o desactivar entrenadores existentes. Los nuevos usuarios tienen rol `coach`; las cuentas de administrador se gestionan desde Supabase. El alta no cambia la sesión del administrador ni envía correos automáticamente.

Para activarlo, sigue [la guía de Usuarios](supabase/WEB-USERS.md): ejecuta [el SQL de usuarios](supabase/migrations/202611100004_web_users.sql) y despliega [la función `club-users`](supabase/functions/club-users/index.ts) en Supabase. La función usa las credenciales privadas del entorno de Edge Functions; el navegador conserva únicamente su clave Publishable y la sesión del usuario. GitHub Pages no despliega esa función. La comprobación JWT del gateway se desactiva solo para ella; el código valida cada sesión mediante Auth y comprueba la membresía de administrador en cada petición.

La membresía y las asignaciones se insertan desde un trigger de Auth, usando metadatos de aplicación que solo la API administrativa puede establecer, dentro de la transacción de creación. El trigger verifica de nuevo al administrador y los equipos. Un fallo revierte el usuario, evitando cuentas sin asignación. El directorio de correos y la creación de equipos tienen comprobaciones de administrador en PostgreSQL. La clave privada y el código servidor no se incluyen en el bundle web.

Los reintentos utilizan el mismo UUID de usuario y prueban los metadatos del intento; no adoptan cuentas por correo, no restablecen contraseñas existentes y no duplican altas si se pierde una respuesta. Ante una confirmación incierta se conservan los mismos datos en memoria para reintentar, sin persistir contraseñas. Tras confirmar el alta se desmonta el formulario y se actualiza la lista; un fallo posterior de refresco se presenta como tal, sin indicar que el alta haya fallado.

Se han probado validaciones, roles, privacidad del directorio, rollback de Auth y asignaciones, reintentos, ausencia de exposición de claves y flujo móvil de alta de equipos y entrenadores. Las pruebas usan PostgreSQL local y respuestas simuladas; la puesta en marcha real requiere aplicar el SQL y desplegar la función desde una sesión administradora de Supabase.

La edición de acceso requiere además [202611100005_coach_access.sql](supabase/migrations/202611100005_coach_access.sql), sin volver a desplegar la función Edge. El cambio de estado y equipos se guarda en una transacción, verifica el estado original para detectar cambios de otro administrador y permite reintentar una respuesta perdida sin duplicar efectos. Desactivar conserva la cuenta, los jugadores y el historial; las políticas de base de datos deniegan nuevas lecturas y escrituras aunque exista una sesión iniciada. Al reactivar, se recupera el acceso a los equipos seleccionados. Un entrenador activo sin equipos solo puede utilizar la biblioteca compartida. Las cuentas de administrador, incluida la propia, no se pueden modificar desde este formulario.


## Calendario del equipo

La pestaña **Calendario** reúne los planes activos y todos los partidos del equipo en un mes, con semanas de lunes a domingo. Permite cambiar de mes, volver a hoy o buscar una fecha. Las letras E/P/A indican entrenamiento, partido y asistencia registrada; varios planes o partidos en el mismo día conservan sus propios accesos. Los entrenamientos archivados siguen disponibles en Entrenar.

Al seleccionar un día se muestra su asistencia registrada y cada actividad. **Pasar lista de este día** abre esa fecha exacta; **Ver plan y PDF** abre la sesión guardada y sus documentos; **Convocatoria y minutos** abre el partido correspondiente. También se puede preparar un entrenamiento o añadir un partido con la fecha elegida ya escrita. **Volver al calendario** conserva la selección y vuelve a cargar las actividades guardadas. Preparar un plan no crea marcas de asistencia.

No requiere SQL nuevo ni permisos adicionales: usa los repositorios existentes y las políticas por equipo. Un error de una de las fuentes se muestra con opción de actualizar y permite consultar la otra; no se presenta una carga fallida como una agenda vacía. Las fechas se manejan como días locales, sin convertirlas a UTC para navegar. Se han probado cuadrículas, años bisiestos, cambios de mes/año y horario, varias actividades por día y flujos móviles de navegación y guardado.

## Ejercicios por categorías de equipo

Cada ficha puede recomendarse para varias categorías: Minis, Prebenjamín, Benjamín, Alevín, Infantil, Cadete, Juvenil, Femenino y Regional. Son etiquetas independientes del contenido (Técnica, Posesión, Defensa, etc.); Femenino se puede combinar con una etapa. Se muestran en las fichas y se pueden combinar con la búsqueda, el contenido y el filtro de archivados. El selector **Categoría del equipo** también está en la biblioteca del editor de entrenamientos.

Los ejercicios anteriores quedan **Sin clasificar**, no se consideran automáticamente adecuados para todas las categorías. **Todas** permite consultarlos y **Sin clasificar** ayuda a localizarlos para completar sus etiquetas. No se asignan categorías a partir del nombre del equipo ni se limita el acceso a la biblioteca: es una recomendación que establece el autor o un administrador.

Requiere [202611100006_exercise_team_categories.sql](supabase/migrations/202611100006_exercise_team_categories.sql). Conserva autores, contenido, revisiones, permisos y planes existentes. Los entrenamientos y PDF siguen usando sus fichas históricas; las etiquetas de equipo sirven para elegir ejercicios en la biblioteca. La API anterior conserva las etiquetas al editar o archivar desde una pestaña antigua. La interfaz puede consultar las fichas antes de activar el SQL y avisa al intentar guardar; nunca anuncia una clasificación guardada sin confirmación. Se han probado validaciones, permisos, reintentos, clientes anteriores, historial y filtros móviles combinados.

## Categoría de cada equipo y recomendaciones al entrenar

Un administrador puede abrir **Menú → Usuarios del club → Gestionar equipos** y asignar a cada equipo una de las categorías del club, por ejemplo **Alevín** al **Alevín B**. También puede elegirla al crear un equipo o dejarlo **Sin categoría**. La asignación se guarda en `teams.category`, no se deduce del nombre. Los equipos existentes empiezan sin categoría y conservan nombres, entrenadores, plantillas e historial.

En **Entrenar → Crear/Editar entrenamiento → Añadir ejercicios de la biblioteca**, los ejercicios etiquetados para la categoría del equipo aparecen primero, con **Recomendado para Alevín**, por ejemplo. Los demás ejercicios siguen disponibles; dentro de cada grupo se conserva el orden alfabético. Los filtros de búsqueda, favoritos, contenido y categoría siguen delimitando la selección. Un ejercicio sin clasificar no se considera recomendado y los archivados siguen excluidos de las nuevas incorporaciones. Cambiar la categoría del equipo o el orden sugerido no altera los bloques de una sesión ni sus copias o PDF.

Para activarlo ejecuta [202611110003_team_categories.sql](supabase/migrations/202611110003_team_categories.sql) en Supabase después del SQL de usuarios. No requiere desplegar otra Edge Function. La ampliación conserva la creación anterior de equipos; las cuentas sin el nuevo SQL pueden seguir usando sus equipos y la biblioteca. Las nuevas APIs validan la categoría, exigen administrador activo y rechazan una edición desactualizada; los reintentos idénticos confirman el resultado sin duplicar equipos ni sobrescribir una categoría posterior.

Se han comprobado orden, combinación de filtros, permisos y conservación de datos con PostgreSQL local y flujos de móvil con respuestas simuladas. Tras activar el SQL, asigna la categoría a los equipos reales y recarga en los otros dispositivos para recoger el cambio.

## Cambiar el nombre, archivar y eliminar equipos vacíos

Los administradores activos disponen de **Menú → Usuarios del club → Gestionar equipos**. Permite **Cambiar nombre**, **Archivar**, **Restaurar** y **Eliminar si está vacío**, además de asignar la categoría. Un cambio de nombre conserva el identificador, entrenadores, jugadores y todo el historial; se muestra en la cabecera y en los documentos que se generen después. Los nombres se normalizan y no pueden coincidir con otro equipo, incluidos los archivados.

Archivar oculta el equipo en las selecciones habituales y conserva sus asignaciones y datos. Se puede encontrar con **Incluir equipos archivados**, restaurarlo o abrir **Consultar historial**. Sus entrenadores también pueden activar **Mostrar equipos archivados** en el selector para consultar sus datos. El historial queda en modo consulta: asistencia, plantilla, partidos, planes y calendario siguen disponibles; se pueden descargar PDF de planes guardados, pero no modificar los datos del equipo. La biblioteca compartida conserva su uso habitual.

La eliminación definitiva exige escribir el nombre exacto y solo admite equipos sin jugadores (incluidos los archivados), asistencias, partidos, convocatorias ni planes. Se eliminan sus asignaciones y se conservan las cuentas de los entrenadores. Si tiene historial, el servidor rechaza la operación y propone archivarlo. No se ha eliminado ningún equipo real al implementar esta función.

Para activarlo ejecuta [202611110005_team_management.sql](supabase/migrations/202611110005_team_management.sql) después de las ampliaciones anteriores y recarga la aplicación. No requiere volver a desplegar `club-users`. La migración conserva los equipos actuales como activos, añade estado de archivo y revisión, mantiene RLS y no concede escrituras directas de equipos. Las nuevas operaciones verifican administrador, estado esperado y dependencias en el servidor; los reintentos idénticos son seguros y los formularios antiguos no sobrescriben metadatos posteriores. Un trigger bloquea inserciones, cambios y borrados del historial archivado, también desde APIs y pestañas antiguas, y nuevas asignaciones a equipos archivados. Restaurar vuelve a permitir trabajar con los mismos datos.

Las copias de seguridad existentes incluyen automáticamente estas columnas y todo el historial. Se han comprobado permisos y conservación con PostgreSQL local y los recorridos móviles con respuestas simuladas, incluidos consulta de partidos, PDF, restauración y limpieza de la selección/asignaciones tras eliminar un equipo vacío.

## Revisión de ejercicios por dirección metodológica

Las fichas de la biblioteca pueden llevar **✓ Revisado y recomendado por el club**. La marca se muestra en el listado, en **Ver ficha** con la fecha de revisión y al elegir ejercicios para un entrenamiento. El filtro **Solo revisados por el club** se combina con búsqueda, contenido, categorías y favoritos; el orden por categoría del equipo se conserva. Las fichas sin marca siguen disponibles.

Los administradores activos pueden revisar. También pueden autorizar entrenadores desde **Usuarios del club → Revisión metodológica → Autorizar como revisor**. Es un permiso independiente: no otorga administración ni permite editar fichas ajenas. Una cuenta desactivada no puede revisar aunque conserve ese permiso. Para marcar o retirar una revisión, el administrador o revisor abre **Ver ficha**, comprueba su contenido y usa el botón de revisión al final. Retirar el permiso impide revisiones futuras; las marcas que ya había puesto siguen perteneciendo al club.

Para activarlo ejecuta [202611110004_exercise_reviews.sql](supabase/migrations/202611110004_exercise_reviews.sql) en Supabase, después de las ampliaciones de categorías de ejercicios e imágenes. No requiere volver a desplegar `club-users`. Los entrenadores existentes empiezan sin el permiso y ninguna ficha se aprueba automáticamente. Se guardan ejercicio, revisión, autor y fecha de la marca, sin duplicar imágenes ni contenido.

La revisión solo se muestra para la versión vigente. Un cambio de descripción, duración, jugadores, espacio, material, categorías, imagen, vídeo o título retira la marca en el servidor, incluso si procede de una pestaña antigua. Archivar, restaurar o guardar el mismo contenido conserva la revisión, su autor y su fecha. Marcar o retirar una revisión no cambia el contenido ni su versión. Los reintentos idénticos conservan el resultado; revisar una ficha desactualizada o retirar una aprobación posterior se rechaza. Las sesiones, copias, PDF, favoritos y asignaciones existentes se conservan.

Los permisos e invalidaciones se verifican con PostgreSQL local; los flujos móviles usan cuentas y respuestas simuladas. Si falta el SQL o falla la consulta, la biblioteca sigue disponible y la revisión no se presupone. Después de activarlo, autoriza a los responsables y comprueba una marca real desde una cuenta del club; en los otros dispositivos, actualiza la biblioteca para recogerla.

## Instalar la web en un dispositivo

Abre [la web del club](https://emmanueltejero.github.io/aplicacionInter/) en un navegador externo a ChatGPT o WhatsApp. El botón **Instalar** abre el diálogo del navegador cuando está disponible y, en otros casos, muestra estas instrucciones:

- **Android, Chrome:** menú ⋮ → Añadir a pantalla de inicio / Instalar aplicación → confirmar.
- **iPhone o iPad, Safari:** Compartir → Añadir a pantalla de inicio. Si aparece Abrir como app web, mantenerlo activado y añadir.
- **Ordenador, Chrome o Edge:** icono de instalación de la barra de direcciones o la opción Instalar del menú.

La aplicación usa el escudo del club como icono y se abre en su propia ventana en los navegadores compatibles. El aviso de instalación se oculta cuando se ejecuta en modo instalado; también se puede cerrar durante la visita actual. El inicio instalado utiliza una dirección fija sin equipo, contraseñas, enlaces de recuperación ni otros datos de usuario. Se puede iniciar sesión con la cuenta habitual del club; algunos dispositivos utilizan un almacenamiento de sesión independiente del navegador. No requiere cambios de SQL, de Supabase ni un dominio diferente.

`npm run build:pages` genera `manifest.webmanifest`, iconos PNG 192/512, un icono maskable con margen, el icono de Apple 180 y `service-worker.js`, todos dentro de `/aplicacionInter/`. Los iconos se preparan con las utilidades de imágenes ya incluidas en Expo a partir del escudo original. El manifiesto mantiene un identificador estable para no duplicar la instalación al publicar cambios.

El service worker consulta la red para las navegaciones de la aplicación y solo guarda `offline.html`, una página pública con el escudo incrustado y el botón **Reintentar conexión**. No almacena respuestas de Supabase, datos del club, sesiones ni páginas de recuperación en Cache Storage. Si se pierde la conexión, no se simula un guardado: hay que reconectar para consultar o modificar datos. Los PDF descargados se consultan desde el dispositivo.

Las actualizaciones se comprueban desde el navegador con un worker versionado por el contenido exportado, eliminando únicamente las versiones antiguas de su propia caché. No fuerzan una recarga que cierre formularios abiertos; al volver a abrir o recargar la aplicación se consulta la versión publicada. Las pruebas verifican manifiesto, iconos, rutas, aislamiento de caché, avisos de instalación, navegación sin conexión y conservación de formularios durante una actualización. La comprobación automatizada en Chromium complementa la prueba final de instalación en un dispositivo real.

## Imágenes, esquemas y vídeos de los ejercicios

En el editor de una ficha se puede **Seleccionar imagen o esquema** desde la web, incluida la PWA de Android/iOS. Admite JPG, PNG y WebP de entrada hasta 10 MB; el navegador conserva la imagen completa, aplana la transparencia sobre blanco, reduce el lado mayor a 1280 píxeles y ajusta calidad/tamaño hasta obtener un JPEG de **200 KiB como máximo**. La previsualización muestra el tamaño preparado. El archivo se sube al guardar, después de validar la ficha; seleccionar y cancelar no lo sube. El selector de archivos no está incluido en los binarios nativos; desde ellos se pueden consultar los medios guardados.

Cada ejercicio admite una imagen y un enlace HTTPS de YouTube o Vimeo. Los vídeos se abren fuera de la aplicación y no se alojan en el club. Los listados muestran que una ficha tiene imagen/vídeo; el archivo se descarga al abrir la ficha, desplegar sus medios en el selector o consultar el plan. Las imágenes se guardan en un bucket **privado** de Supabase Storage, accesible solo para miembros activos, y las tablas guardan únicamente referencias y enlaces, nunca imágenes en base64. Las subidas utilizan la clave pública y el JWT del usuario, sin secretos privilegiados.

Requiere [202611110001_exercise_media.sql](supabase/migrations/202611110001_exercise_media.sql). Crea el bucket, limita sus objetos a JPEG de 204800 bytes y añade políticas de lectura/alta, sin permisos de sobrescritura o borrado desde la aplicación. La ficha y sus medios se guardan atómicamente con autor/revisión. Las versiones anteriores de la web siguen editando fichas sin borrar sus medios. Si falta el SQL, la lectura y los guardados sin medios usan las APIs anteriores; las nuevas imágenes/vídeos muestran la activación pendiente.

El nombre de archivo es inmutable y estable durante un intento: un reintento no crea otra copia ni sobrescribe la imagen. Las sesiones guardan la referencia de la versión elegida, por lo que editar, archivar o quitar la imagen de la biblioteca no cambia sesiones anteriores. Las copias conservan la misma referencia. El PDF y la impresión incorporan la imagen y un enlace al vídeo; las imágenes repetidas en una sesión se descargan una vez por exportación y se reutilizan dentro del PDF. Si falta una imagen, la exportación falla con aviso en vez de omitirla silenciosamente.

Como límite superior aproximado, 500 archivos de 200 KiB son 100 MiB y 1000 son 200 MiB (más las versiones anteriores). La cuota disponible y el tráfico de descargas dependen del plan del proyecto y deben revisarse en Supabase. No se confirma aquí una cuota contratada. Los archivos de versiones históricas y de subidas cuyo guardado falle se conservan: no hay limpieza automática en esta primera versión. Esto protege las referencias de planes y reintentos inciertos; conviene revisar el uso de Storage antes de ampliar la biblioteca. Quitar una imagen de la ficha no borra el archivo físico.
