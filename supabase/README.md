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
