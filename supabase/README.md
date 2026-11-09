# Conectar el proyecto Supabase del club

Esta carpeta prepara la base de datos y sus permisos. La aplicación no contiene claves privadas ni tiene permiso para crear tablas o dar de alta administradores.

## 1. Crear las tablas

En el proyecto nuevo, abre **SQL Editor → New query**, pega `migrations/202611050001_club.sql` y ejecuta una sola vez. La migración se ejecuta dentro de una transacción. Si hay tablas previas con estos nombres, investiga el conflicto; no las borres para forzar su ejecución.

Tablas: `club_members`, `teams`, `team_coaches`, `players` y `attendance`. Todos los datos están protegidos por RLS. Un entrenador ve sus equipos; un administrador activo ve todos. Una cuenta sin membresía activa no tiene acceso. No se permiten eliminaciones desde la aplicación ni cambios de equipo/identidad de registros históricos.

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

Por ahora se gestionan desde el panel de Supabase (el panel administrativo en la app es trabajo futuro):

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
