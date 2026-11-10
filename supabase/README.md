# Conectar el proyecto Supabase del club

Esta carpeta prepara la base de datos y sus permisos. La aplicación no contiene claves privadas ni tiene permiso para crear tablas o dar de alta administradores.

## 1. Crear las tablas

En el proyecto nuevo, abre **SQL Editor → New query**, pega `migrations/202611050001_club.sql` y ejecuta una sola vez. La migración se ejecuta dentro de una transacción. Si hay tablas previas con estos nombres, investiga el conflicto; no las borres para forzar su ejecución.

Tablas: `club_members`, `teams`, `team_coaches`, `players` y `attendance`. Todos los datos están protegidos por RLS. Un entrenador ve sus equipos; un administrador activo ve todos. Una cuenta sin membresía activa no tiene acceso. Los jugadores se archivan; no se permite borrarlos ni cambiar los identificadores de registros históricos. Para quitar marcas de asistencia, aplica la ampliación descrita más abajo.

## 2. Configurar el acceso de la aplicación

En **Project Settings → API Keys** busca la clave **Publishable** (`sb_publishable_…`). Es la clave pública de cliente, nunca una clave `secret` ni `service_role`.

Configura estas variables en el entorno de desarrollo; para ejecutarlo en un ordenador, usa un `.env.local` ignorado por Git, siguiendo `.env.example`:

- `EXPO_PUBLIC_SUPABASE_URL`: la URL HTTPS del proyecto.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: la clave pública Publishable.

Expo incorpora los valores al bundle: reinicia el servidor o reconstruye después de cambiarlos. No introduzcas credenciales privilegiadas en variables `EXPO_PUBLIC_*`. La seguridad de los datos se aplica en PostgreSQL con RLS, no ocultando la clave pública.

En el entorno de la nube debe permitirse el hostname exacto del proyecto por HTTPS. La configuración guardada en borrador no equivale a una conexión verificada ni activa un cambio de red por sí sola.

## 3. Crear la primera cuenta

En **Authentication → Users → Add user → Create new user**, crea tu cuenta de administrador con correo y una contraseña que guardes de forma segura. Para esta primera cuenta puedes marcar **Auto Confirm User** si la interfaz lo ofrece. No hace falta enviar invitaciones desde la aplicación.

Abre `bootstrap-admin.sql`, cambia `CAMBIA_ESTE_CORREO` por ese correo y ejecútalo en SQL Editor. Otorga el rol de administrador a esa cuenta y crea `Primer equipo` si no existe. Es una operación de administración exclusiva del propietario del proyecto; nunca debe ejecutarse desde el navegador de los entrenadores.

Después, inicia sesión en la aplicación. Una cuenta creada en Authentication sin membresía/equipo tendrá acceso vacío; eso es intencionado.

## 4. Dar de alta entrenadores y equipos

Puedes gestionarlos desde **Usuarios del club** después de completar [la activación de usuarios desde la web](WEB-USERS.md). Para hacerlo manualmente desde el panel de Supabase:

1. Crea el usuario en Authentication. Comparte sus credenciales por un canal seguro; no uses el repositorio ni este chat para contraseñas.
2. En Table Editor, añade `club_members` con su `user_id`, `role=coach`, `enabled=true`.
3. Crea o elige un equipo en `teams`.
4. Añade a `team_coaches` su `user_id` y el `team_id` asignado. Se permiten varios equipos por entrenador.

Desactiva el alta pública de cuentas en las opciones de Authentication si solo el club debe crear usuarios. Incluso si alguien se registra por otro medio, una cuenta sin membresía no puede leer los datos.

Para retirar el acceso, establece `club_members.enabled=false`; las políticas deniegan inmediatamente las lecturas/escrituras de datos del club aunque quede una sesión iniciada.

## 5. Validación real pendiente

Las pruebas locales de `npm test` ejecutan la migración en PostgreSQL mediante PGlite y comprueban aislamiento entre equipos, no escalada de privilegios, cuentas deshabilitadas, dorsales únicos, archivo reversible e historial. No prueban la configuración, correo ni credenciales de tu proyecto remoto.

Antes de introducir datos reales, verifica en Supabase dos cuentas de entrenadores con equipos distintos: cada una ve solo su equipo, puede añadir/editar/archivar/restaurar jugadores y marcar asistencia, los cambios sobreviven a una nueva sesión, y la otra cuenta no puede consultarlos. Verifica también el cierre de sesión y el comportamiento ante una conexión interrumpida.

La versión portátil HTML sigue siendo una demo local sin autenticación ni conexión a Supabase.

## Activar «Quitar marca» en asistencia

Ejecuta `migrations/202611090003_clear_attendance.sql` en **SQL Editor → New query → Run**. Se puede ejecutar de nuevo y no cambia los datos existentes. Añade permiso de borrado exclusivamente en `attendance` y una política RLS: cada entrenador puede quitar marcas de jugadores activos de sus equipos y los administradores activos de cualquier equipo. Las cuentas anónimas, deshabilitadas o sin asignación no pueden borrar esas marcas. Los jugadores archivados conservan su historial; para corregirlo hay que restaurarlos primero.

En **Pasar lista**, el botón **Quitar marca** elimina únicamente la asistencia del jugador y la fecha seleccionados. El jugador vuelve a **Sin marcar** y ese registro sale de los porcentajes de Resumen; no se convierte en ausencia. Si falta la ampliación o falla el borrado, se conserva la marca y aparece un aviso. No se otorgan permisos para borrar jugadores, equipos ni partidos.

**Buscar asistencia por fecha** permite introducir `AAAA-MM-DD` y pulsar **Ver fecha**. Se comprueba que el día existe antes de cambiar la lista. Las flechas y **Volver a hoy** siguen disponibles. Consultar una fecha no crea registros.

## Recuperación de contraseña desde la web

En **Authentication → URL Configuration**, configura:

- **Site URL**: `https://emmanueltejero.github.io/aplicacionInter/`
- **Redirect URLs**: añade la dirección exacta `https://emmanueltejero.github.io/aplicacionInter/?password_reset=1`.

Desde la web, el usuario pulsa **He olvidado mi contraseña**, escribe su correo y solicita un enlace. No se envían correos automáticamente al abrir la pantalla ni desde las pruebas. La respuesta evita confirmar si una cuenta existe. Supabase limita los envíos y su servicio de correo predeterminado puede restringir destinatarios; para todos los entrenadores puede ser necesario configurar un remitente SMTP propio.

El enlace verifica la sesión mediante el SDK de Supabase y abre el formulario de contraseña nueva. La contraseña se envía únicamente al proyecto de Supabase. El formulario requiere al menos 8 caracteres y confirmación idéntica; el servidor puede imponer requisitos adicionales. Tras guardarla, el usuario entra a su equipo. La sesión de recuperación se puede cancelar; los enlaces caducados o erróneos no permiten cambiar la contraseña de una sesión anterior. El formulario conserva el modo de recuperación al recargar y elimina los datos temporales del enlace del estado de navegación.

Nunca se comparten contraseñas ni enlaces de recuperación por el chat o el repositorio. Las pruebas del flujo utilizan contraseñas, tokens y respuestas ficticios; la entrega del correo y el cambio de contraseña reales requieren que el usuario actúe desde su navegador.

## Activar partidos y minutos

Sobre la base de datos existente, ejecuta una sola vez en **SQL Editor → New query** el archivo `migrations/202611090002_matches.sql`. Es una ampliación distinta de la migración inicial: crea únicamente `matches`, `match_players`, sus políticas y la función `save_match`. La operación está en una transacción y no modifica la asistencia ni las plantillas.

Las tablas de partidos solo admiten lectura de los equipos autorizados. Toda escritura desde la aplicación pasa por `save_match`, que verifica la pertenencia al equipo y guarda metadatos, convocatoria y minutos juntos. Valida duración de 1 a 240 minutos, participantes del mismo equipo, ausencia de duplicados, minutos entre 0 y duración y que un partido futuro no se marque como disputado. Los jugadores archivados solo pueden conservar una participación que ya existía. El cliente utiliza un UUID estable para que reintentar un guardado no cree otro partido.

Mientras no se aplique la ampliación, la pestaña Partidos muestra las instrucciones de activación; la plantilla y la asistencia siguen disponibles. Tras ejecutar el SQL, pulsa **Reintentar carga** en esa pestaña. Si indica que una tabla ya existe, no elimines datos: comprueba primero si la ampliación ya se ejecutó.

Un campo de minutos vacío significa pendiente; `0` indica convocado sin jugar. Los totales solo incluyen partidos marcados como disputados, no futuros y dentro de las fechas elegidas. Se muestran convocatorias, participaciones con minutos positivos, minutos conocidos y registros pendientes. Los minutos guardados de partidos que vuelven a marcarse pendientes se conservan, pero no se suman hasta que vuelvan a estar disputados.

Las pruebas locales ejecutan ambas migraciones en PGlite y comprueban permisos, rechazo de escrituras directas, reintentos, validaciones y conservación del historial. La entrega real requiere aplicar esta ampliación en el proyecto remoto y probar un guardado desde una cuenta del club. La clave pública no permite ejecutar migraciones; no se solicita una clave privilegiada para este paso.

## Activar la biblioteca compartida de ejercicios

Ejecuta `migrations/202611100001_exercises.sql` en **SQL Editor → New query → Run** y abre **Ejercicios → Reintentar biblioteca** en la aplicación. Se puede repetir sin borrar los ejercicios existentes. Esta ampliación crea `exercises` y sus funciones y permisos; no cambia las tablas de equipos, jugadores, asistencia ni partidos. No carga los ejemplos ficticios de la demo en las cuentas reales.

Todo miembro activo del club puede leer la biblioteca completa y añadir ejercicios, incluso sin equipo asignado. Solo el autor y un administrador activo pueden modificar, archivar o restaurar. `created_by` se obtiene de la sesión autenticada en el servidor: el cliente no puede asignar otro autor. Si se elimina la cuenta de un autor, su ejercicio se conserva y los administradores pueden mantenerlo. Las cuentas deshabilitadas, sin membresía o anónimas no tienen acceso.

La tabla solo concede lectura a los clientes; todas las escrituras se realizan mediante `save_exercise`, que valida los campos y comprueba la revisión antes de actualizar. Los reintentos idénticos no duplican ejercicios ni incrementan otra vez su revisión. Si otro editor ya cambió la ficha, la aplicación indica que hay que cerrarla y actualizar la biblioteca. Archivar es reversible y conserva el contenido.

Las pruebas en PGlite ejecutan todas las ampliaciones, repiten esta migración sobre datos existentes y comprueban que dos entrenadores con equipos distintos comparten la lectura, que solo autor/admin escriben y que las restricciones no se pueden saltar mediante peticiones directas. Las pruebas de navegador usan datos ficticios y respuestas simuladas. Tras la activación real, verifica desde tu cuenta la creación y persistencia de un ejercicio y, desde otra cuenta de entrenador, su lectura sin botones de edición ajena.

## Activar los planes de entrenamiento

Después de activar la biblioteca, ejecuta `migrations/202611100002_training_plans.sql` en **SQL Editor → New query → Run**. Abre **Entrenar → Reintentar entrenamientos** en la aplicación. La migración se puede repetir sobre datos existentes; crea `training_plans`, sus permisos y la función `save_training_plan`. No modifica asistencia, jugadores, partidos ni ejercicios.

Cada plan se vincula a un equipo. RLS permite leerlo a sus entrenadores asignados y a los administradores activos; las mismas condiciones se comprueban en cada escritura, incluso si el autor original ya no está asignado. Otros equipos, cuentas deshabilitadas o sin membresía y usuarios anónimos quedan excluidos. No se permiten escrituras directas ni borrados: se archiva y restaura mediante la función.

`save_training_plan` recibe metadatos, revisión y una lista ordenada de identificadores de bloque, ejercicio de origen, revisión de ficha y duración. Para bloques nuevos, comprueba que el ejercicio existe, sigue activo y conserva la revisión seleccionada. Construye la copia de la ficha en el servidor. Para bloques guardados, conserva esa copia y solo permite cambiar duración, orden o eliminar el bloque. Esto evita reescribir el historial si cambia o se archiva una ficha. Una ficha nueva desactualizada requiere actualizar la biblioteca y quitar y volver a añadir ese bloque; un plan desactualizado requiere cerrar el editor y actualizar los entrenamientos.

La función valida fecha, título, jugadores de 1 a 100, notas de hasta 3000 caracteres, 1–50 bloques, identificadores únicos y duraciones de 1–240 minutos con suma máxima de 600. Guarda todo en una transacción, conserva autoría, impide cambiar de equipo y acepta reintentos idénticos sin duplicados. Las cantidades y dimensiones se toman de las fichas; los totales se calculan al mostrar el plan y asumen ejercicios consecutivos.

Las pruebas locales ejecutan la migración sobre todas las ampliaciones anteriores y la repiten con planes existentes; comprueban aislamiento entre equipos, colaboración dentro del equipo, administración, restricciones, reintentos, conflictos y conservación de copias. Tras activarla, crea un plan desde tu cuenta, recarga para verificar persistencia y comprueba con otra cuenta que solo los entrenadores asignados al equipo pueden consultarlo.

## Activar la duplicación de entrenamientos

Ejecuta `migrations/202611100003_copy_training_plans.sql` en **SQL Editor → New query → Run**, después de la ampliación de planes. La operación se puede repetir y conserva los datos existentes. Añade `copied_from` y `copied_from_revision` a `training_plans` y la función `copy_training_plan`; mantiene los permisos anteriores. **Guardar PDF** e **Imprimir** funcionan sin esta ampliación.

La función comprueba que el usuario sigue autorizado para el equipo y que el plan original pertenece a ese mismo equipo. Conserva la revisión elegida y copia las fichas históricas en orden, con identificadores nuevos de bloque. La copia empieza activa, con revisión 1 y el usuario actual como autor, incluso si el original está archivado. No consulta la biblioteca ni acepta cantidades o descripciones nuevas desde el cliente.

Si se pierde una respuesta, el mismo identificador devuelve la copia ya creada sin duplicarla, aunque después haya cambiado el original. Si la copia ya se ha editado o el origen estaba desactualizado antes de crearla, se rechaza el intento para evitar sobrescribir datos. Los entrenadores de otros equipos, usuarios deshabilitados o sin membresía y cuentas anónimas no pueden utilizar la función. Las pruebas ejecutan esta ampliación sobre todas las anteriores, la repiten con copias existentes y verifican permisos, independencia, fichas archivadas, conflictos y reintentos.

## Activar las altas de usuarios desde la web

Sigue [WEB-USERS.md](WEB-USERS.md). Requiere `migrations/202611100004_web_users.sql` y la función Edge `club-users`. El SQL no cambia las cuentas existentes; añade un trigger de aprovisionamiento, el directorio exclusivo de administradores y la creación autorizada de equipos. La función verifica sesión, administrador activo y preparación del SQL antes de llamar a la API Admin de Auth. Las cuentas nuevas reciben membresía `coach` y todas las asignaciones en la transacción de creación de Auth. No se exponen claves privadas en la web ni se concede acceso de escritura directo a `club_members` o `team_coaches`.
