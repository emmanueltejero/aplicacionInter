# Activar las altas de entrenadores desde la web

Esta activación se realiza **una vez**. Después entra con tu cuenta de administrador y abre **Usuarios del club → Añadir entrenador**. Podrás crear equipos, escribir nombre/correo/contraseña y asignar uno o varios equipos, sin copiar identificadores. Las cuentas nuevas tienen rol **Entrenador**; este apartado no concede roles de administrador ni cambia contraseñas de cuentas existentes.

## 1. Ejecutar el SQL

Abre [202611100004_web_users.sql](migrations/202611100004_web_users.sql), copia todo su contenido y ejecútalo en **Supabase → SQL Editor → New query → Run**. Se puede repetir y no modifica las cuentas existentes.

Este SQL prepara la lista privada de usuarios, la creación de equipos y la asignación automática de membresía/equipos durante el alta de Authentication. Si falla esa asignación, la creación de la cuenta se revierte en la misma transacción. Las altas normales de Authentication sin los metadatos del servidor siguen sin recibir acceso al club.

## 2. Crear la función de Supabase

1. En el panel del mismo proyecto, abre **Edge Functions**.
2. Pulsa **Deploy a new function** y elige **Via Editor** (puede aparecer como crear/desplegar desde el editor).
3. Pon como nombre exacto **`club-users`**.
4. Abre [functions/club-users/index.ts](functions/club-users/index.ts). Usa **Copy raw file** en GitHub para copiar el archivo completo.
5. En el editor de Supabase, sustituye todo el contenido de **`index.ts`** por ese código. Es un único archivo y no necesita instalar paquetes.
6. Pulsa **Deploy function**.
7. En **Details / Settings** de esa función, desactiva la comprobación de JWT del gateway, llamada **Verify JWT with legacy secret** o similar. Este cambio es **solo para `club-users`**. El código verifica cada token con Authentication y comprueba el administrador activo en la base de datos antes de utilizar la API de administración. Esa comprobación propia acepta las configuraciones actuales de firma de Supabase; no se basa en datos enviados por el formulario.

La función utiliza **`SUPABASE_URL`** y los diccionarios **`SUPABASE_PUBLISHABLE_KEYS`** / **`SUPABASE_SECRET_KEYS`**, que Supabase proporciona a sus Edge Functions. También admite las variables anteriores `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` como alternativa. Las comprobaciones de permisos usan la sesión del usuario; la clave privada solo se utiliza para la API administrativa de Auth. No necesitas poner ninguna clave privada en la web, el repositorio, las variables `EXPO_PUBLIC_*` ni el chat.

La dirección web permitida por defecto es el origen `https://emmanueltejero.github.io`. Para alojar la aplicación en otro dominio, configura en los secretos de la función `CLUB_ALLOWED_ORIGINS` con los orígenes completos separados por comas, sin rutas. En aplicaciones nativas no hay cabecera Origin, pero se exigen las mismas comprobaciones de sesión y permisos.

Si despliegas con Supabase CLI, `supabase/config.toml` ya contiene `verify_jwt = false` para esta función. El despliegue sigue requiriendo una sesión de administración del proyecto; GitHub Pages publica la interfaz y no despliega Edge Functions ni guarda claves privilegiadas.

## 3. Probar desde la aplicación

1. Entra en [Usuarios del club](https://emmanueltejero.github.io/aplicacionInter/?view=users) con tu cuenta de administrador. Si aparece una pantalla de activación, pulsa **Reintentar usuarios** después de completar los pasos anteriores.
2. Si necesitas otro equipo, pulsa **Crear equipo**.
3. Pulsa **Añadir entrenador**, escribe su nombre, correo, contraseña inicial y confirmación y selecciona los equipos.
4. Pulsa **Crear entrenador**. La cuenta queda confirmada y puede iniciar sesión con esas credenciales. La operación no envía un correo automático.
5. Comparte las credenciales por un canal privado y comprueba el acceso con el entrenador. La cuenta del administrador sigue conectada; no se inicia sesión como el usuario recién creado.

Los entrenadores y cuentas desactivadas no ven este acceso y no pueden llamar a los endpoints de administración. La lista muestra usuarios del club, roles, estado y equipos. Las cuentas y roles de administrador se gestionan desde el panel de Supabase.

## 4. Activar la edición de equipos y acceso

Si las altas ya funcionan, solo hace falta este paso: abre [202611100005_coach_access.sql](migrations/202611100005_coach_access.sql), copia todo y ejecútalo en **Supabase → SQL Editor → New query → Run**. Se puede repetir y no cambia las cuentas ni el historial. No es necesario volver a desplegar `club-users`.

En **Usuarios del club**, pulsa **Equipos y acceso** en la tarjeta de un entrenador. Marca sus equipos, activa o desactiva **Acceso activado** y pulsa **Guardar acceso**. Puedes cancelar sin aplicar cambios. El formulario solo permite modificar entrenadores; las cuentas de administrador, incluida la propia, están protegidas también en la base de datos.

Desactivar conserva la cuenta, los ejercicios, la asistencia y el resto del historial. La base de datos bloquea las siguientes peticiones de lectura y escritura de esa cuenta, aunque siga iniciada su sesión. Los datos ya cargados en pantalla no desaparecen hasta actualizar; el entrenador verá sus equipos vigentes al recargar la aplicación. Reactivar devuelve acceso a los equipos seleccionados. Con acceso activado y ningún equipo seleccionado, solo podrá utilizar la biblioteca compartida. Este formulario no elimina cuentas de Authentication ni cambia contraseñas.

Los cambios de estado y equipos se aplican juntos. Si otro administrador ha cambiado el acceso desde que abriste el formulario, se rechaza el guardado: cierra el formulario, pulsa **Actualizar usuarios** y revisa de nuevo. Si se pierde la respuesta, puedes reintentar con los mismos valores o actualizar la lista para comprobar el resultado; no se anuncia éxito hasta recibir confirmación.

## Si aparece un error

- **Falta activar la gestión de usuarios:** ejecuta el SQL del paso 1. La función no crea cuentas mientras falte el mecanismo de asignación automática.
- **Falta desplegar la función `club-users`:** comprueba el nombre y el despliegue del paso 2.
- **Falta activar la edición del acceso:** ejecuta el SQL del paso 4. No hace falta cambiar el despliegue de la función ni sus secretos.
- **Sesión no válida / HTTP 401 en la función:** comprueba el ajuste de JWT del gateway del paso 2. Si ya está desactivado, cierra sesión y vuelve a entrar para obtener una sesión vigente. La función seguirá verificándola con Authentication.
- **Solo administradores:** la cuenta debe tener `role=admin` y `enabled=true` en `club_members`. No se confía en roles de `user_metadata` o campos del formulario.
- **El correo ya existe:** no se modifica esa cuenta ni su contraseña. Revisa si ya aparece en la lista o termina su configuración desde Supabase si se creó manualmente sin membresía.
- **Contraseña rechazada:** respeta los requisitos de contraseña configurados en Authentication. El formulario admite al menos ocho caracteres y un máximo de 72 bytes.
- **No se pudo confirmar el alta:** reintenta con los mismos datos. El identificador del intento se conserva mientras el formulario esté abierto. Si cierras, actualiza la lista antes de volver a crear la cuenta: una respuesta perdida puede corresponder a un alta ya completada. Un reintento nunca restablece una contraseña ni reescribe los permisos existentes.

Las contraseñas permanecen solo en memoria durante el formulario y en la petición HTTPS a la función/Authentication; no se almacenan en localStorage, AsyncStorage, la lista de usuarios ni registros de la función. Los errores no devuelven respuestas internas de Authentication ni valores de claves. Las pruebas usan cuentas, contraseñas y claves ficticias y no envían correos ni crean cuentas reales.
