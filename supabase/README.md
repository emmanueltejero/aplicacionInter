# Conectar el proyecto Supabase del club

Esta carpeta prepara la base de datos y sus permisos. La aplicación no contiene claves privadas ni tiene permiso para crear tablas o dar de alta administradores.

Para copias de seguridad de datos, cuentas e imágenes, sigue [BACKUPS.md](BACKUPS.md). El flujo está preparado para el plan Free y necesita secretos de servidor exclusivos de GitHub Actions; no se configuran en la aplicación. Publicar el código no activa las copias ni crea automáticamente la primera.

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

## Activar la edición de equipos y acceso de entrenadores

Ejecuta `migrations/202611100005_coach_access.sql` en **SQL Editor → New query → Run**, después del SQL de usuarios. No requiere volver a desplegar `club-users`. Se puede repetir y no modifica datos existentes. Añade una función exclusiva de administradores activos para cambiar juntos los equipos y el estado de un entrenador. Las cuentas de administrador no pueden modificarse desde ella; tampoco permite cambiar roles, contraseñas o borrar cuentas. Mantiene denegadas las escrituras directas a membresías y asignaciones.

En **Usuarios del club → Equipos y acceso**, selecciona los equipos y el estado y guarda. Desactivar conserva todo el historial y deniega nuevas peticiones del entrenador mediante las políticas existentes, incluso con una sesión abierta. Reactivar permite acceder a los equipos seleccionados; sin equipos, un entrenador activo puede utilizar la biblioteca compartida. Si otro administrador ha cambiado el acceso, actualiza la lista antes de editar de nuevo. Las pruebas en PostgreSQL local comprueban permisos, retirada de equipos, desactivación y reactivación, conservación de datos, conflictos, reintentos y repetición del SQL.

## Activar categorías de equipo para los ejercicios

Abre [202611100006_exercise_team_categories.sql](migrations/202611100006_exercise_team_categories.sql), copia todo y ejecútalo en **SQL Editor → New query → Run** después del SQL de biblioteca. No requiere desplegar funciones Edge. Se puede repetir y conserva los ejercicios y entrenamientos existentes. Después pulsa **Actualizar biblioteca** en la aplicación; en el editor de una sesión puedes pulsar **Actualizar ejercicios**.

Añade `exercises.team_categories`, inicialmente vacío, con valores validados del club. Vacío significa **Sin clasificar**. La nueva función `save_exercise_with_team_categories` guarda ficha, etiquetas, archivo y revisión juntos; solo autor o administrador activo puede modificar una ficha y el autor original se conserva. Las categorías repetidas o desconocidas se rechazan. Se mantienen RLS y la prohibición de escrituras directas. Un reintento idéntico devuelve el resultado anterior; un cambio con una revisión desactualizada se rechaza.

La función anterior `save_exercise` conserva las etiquetas si una pestaña antigua edita o archiva una ficha. Los planes guardados, sus copias y PDF conservan sus instantáneas; esta ampliación no las reescribe. Si aún no se ha ejecutado el SQL, la lectura de la biblioteca utiliza las columnas anteriores, muestra la activación pendiente y deshabilita el filtro nuevo. El guardado nuevo muestra un aviso y conserva el formulario hasta poder confirmarlo; no descarta las etiquetas para simular un guardado.

## Activar imágenes y enlaces de vídeo

Después del SQL de categorías, ejecuta [202611110001_exercise_media.sql](migrations/202611110001_exercise_media.sql) completo en **SQL Editor → New query → Run**. Se puede repetir y conserva las fichas y sesiones actuales. No requiere desplegar una Edge Function ni añadir claves privadas. Luego pulsa **Actualizar biblioteca** en la web. El bucket `exercise-images` aparecerá en **Storage**, privado y con máximo 204800 bytes por objeto JPEG.

La aplicación comprime antes de subir. Las políticas permiten consultar archivos a miembros activos y subir solo a la carpeta del propio usuario con identificadores UUID; no conceden modificación ni borrado de objetos. `save_exercise_with_media` verifica autor/admin, revisión, existencia, propietario del envío, tipo/tamaño del objeto y enlaces de vídeo permitidos antes de asociarlos atómicamente a la ficha. Las APIs de edición anteriores conservan los campos nuevos.

`save_training_plan` captura los medios desde la ficha del servidor y no acepta referencias de imagen o vídeo enviadas como datos de un bloque. Al editar se conservan las instantáneas guardadas; las copias también las mantienen. Las referencias no expiran y los archivos privados se descargan usando la sesión; los PDF incorporan los bytes de la imagen para su lectura offline. No se almacenan enlaces públicos de Storage ni URLs firmadas en las tablas.

El gasto corresponde a Storage y al tráfico, no a columnas binarias en PostgreSQL. Revisa cuota y consumo en el panel del proyecto; no se presupone qué plan está contratado. Las imágenes anteriores y las subidas de intentos fallidos se retienen para no romper planes ni reintentos. No hay borrado automático. No borres manualmente archivos usados por sesiones: quitar una imagen de la ficha solo cambia esa ficha y no libera su archivo histórico. Las pruebas locales simulan Storage y verifican las políticas SQL, mientras las pruebas de navegador usan archivos y respuestas de API ficticios; comprueba una subida real desde tu cuenta después de activar el SQL.

## Activar favoritos personales de ejercicios

Ejecuta [202611110002_exercise_favorites.sql](migrations/202611110002_exercise_favorites.sql) completo en **SQL Editor → New query → Run**, después de activar la biblioteca. No requiere otra Edge Function ni cambiar claves. Puede repetirse y conserva los datos actuales. Después recarga la web o pulsa **Actualizar favoritos** en el aviso de activación.

La tabla `exercise_favorites` contiene una fila por usuario y ejercicio, con una clave compuesta que evita duplicados. RLS permite consultar únicamente la lista del usuario autenticado y activo; el rol administrador no permite consultar las listas de otros. La función `set_exercise_favorite` obtiene el propietario de la sesión y establece explícitamente el estado, sin permitir escrituras directas ni aceptar un propietario del cliente. Las cuentas desactivadas, ajenas al club o anónimas no pueden usarla. Las referencias se eliminan si desaparece la cuenta o la ficha; archivar conserva la selección.

Para verificarlo, guarda un favorito desde una cuenta y abre la misma cuenta en otro navegador: debe aparecer en **Mis favoritos**, también al crear un entrenamiento. Otra cuenta debe tener su propia selección. Marca y desmarca, actualiza y comprueba que se conserva el último estado; la biblioteca, sus imágenes y las sesiones guardadas deben seguir iguales.

## Asociar una categoría a cada equipo

Ejecuta [202611110003_team_categories.sql](migrations/202611110003_team_categories.sql) en **SQL Editor → New query → Run**, después de activar usuarios desde la web. Se puede repetir, conserva los datos actuales y no requiere cambios en la función Edge `club-users`. Después recarga la web.

Desde una cuenta administradora, abre **Menú → Usuarios del club → Categorías de equipos**, asigna por ejemplo **Alevín** al **Alevín B** y guarda. Los equipos existentes empiezan **Sin categoría**, sin inferencias por nombre. Al crear equipos nuevos también se puede elegir su categoría. Las opciones coinciden con las recomendaciones de la biblioteca: Minis, Prebenjamín, Benjamín, Alevín, Infantil, Cadete, Juvenil, Femenino y Regional.

La tabla `teams` incorpora `category`, nullable y con valores validados. `admin_create_team_with_category` crea nombre y categoría de forma atómica; `admin_set_team_category` compara el valor esperado antes de cambiarlo. Ambas exigen administrador activo, usan la sesión del cliente y admiten reintentos seguros. RLS sigue limitando las lecturas a los equipos asignados y no se conceden escrituras directas. La API de creación anterior sigue funcionando y conserva la categoría al confirmar equipos ya creados.

Verifica el cambio abriendo un entrenamiento del equipo: sus ejercicios recomendados deben aparecer primero y los demás seguir disponibles. Cambia de equipo y comprueba que usa su propia categoría. Los favoritos, plantillas, asistencia, partidos y sesiones guardadas deben conservarse. En otros dispositivos, recarga para recoger la categoría actualizada.

## Activar la revisión metodológica de ejercicios

Ejecuta [202611110004_exercise_reviews.sql](migrations/202611110004_exercise_reviews.sql) completo en **SQL Editor → New query → Run** tras activar categorías de ejercicios e imágenes. Es repetible y conserva los datos actuales. No requiere desplegar de nuevo la función Edge. Después recarga la web.

El administrador puede abrir **Usuarios del club**, localizar a un entrenador y usar **Revisión metodológica → Autorizar como revisor**. Todos los entrenadores empiezan sin ese permiso. Los administradores activos pueden revisar sin una asignación adicional. El nuevo permiso no modifica rol, equipos, acceso ni autoría de las fichas; solo un administrador puede concederlo o retirarlo. Desactivar la cuenta bloquea también la revisión.

`exercise_reviews` tiene una fila por ficha aprobada, con su versión, revisor y fecha. RLS permite leer las marcas a los miembros activos del club. Las escrituras directas están denegadas. `set_exercise_review` verifica permiso y versión, obtiene el autor de la sesión y confirma altas y bajas explícitas. La repetición de una aprobación conserva fecha y autor; retirar una marca con una fecha esperada antigua se rechaza si ya existe una nueva aprobación. `admin_set_exercise_reviewer` gestiona únicamente el permiso delegado de las cuentas de entrenador.

Un trigger de `exercises` invalida la marca ante cambios de contenido, incluidos medios y categorías, desde cualquier API de edición. Archivar, restaurar y guardar idéntico contenido actualizan la versión asociada sin cambiar la fecha original. Las migraciones no aprueban ejercicios ni reescriben entrenamientos históricos. Retirar el permiso a un revisor conserva las aprobaciones anteriores; las puede retirar un administrador u otro revisor autorizado.

Comprueba con un entrenador autorizado que puede marcar una ficha de otro autor, pero sigue sin poder editarla ni gestionar usuarios. Desde otro entrenador, actualiza la biblioteca para ver la marca y usar **Solo revisados por el club**. Edita el contenido desde su autor y verifica que la marca desaparece. Comprueba también la retirada de una marca y la revocación del permiso de revisión.
