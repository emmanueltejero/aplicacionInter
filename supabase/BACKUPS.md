# Copias cifradas y recuperación del club

## Estado y alcance

El flujo **Copias cifradas del club** está preparado y requiere activar los secretos indicados abajo. Publicar el código no crea la primera copia ni activa la programación. El plan gratuito de Supabase no ofrece las copias diarias de los planes de pago: aquí se usa una exportación lógica mediante Supabase CLI 3.1.0 y una copia independiente de Storage, ejecutadas en GitHub Actions.

Incluye datos del club y cuentas de Auth (incluidas identidades), esquema público, funciones, RLS, roles exportables, referencia de los esquemas gestionados `auth`/`storage`, personalizaciones conocidas del club, todos los JPEG del bucket privado `exercise-images`, huellas SHA-256 y código versionado del commit utilizado. Incluye también imágenes antiguas conservadas por sesiones. YouTube/Vimeo quedan representados por sus enlaces, no por copias de los vídeos externos. La copia no modifica Supabase.

Las claves API, contraseñas de conexión, contraseña del cifrado y configuración externa del panel no se añaden al archivo. La contraseña cifrada de los usuarios de Auth forma parte de los datos privados: todo el paquete se cifra. SMTP, URL de acceso/recuperación, proveedores de Auth, secretos de funciones y configuración de GitHub deben revisarse al reconstruir el servicio. No se usa Vault/pgsodium en la aplicación; si se incorporan en el futuro, habrá que ampliar el plan para recuperar sus claves, que no se incluyen en una exportación SQL.

## 1. Configurar cuatro secretos en GitHub

Abre **GitHub → aplicacionInter → Settings → Secrets and variables → Actions → Secrets → New repository secret**. Los nombres deben coincidir exactamente. No pegues estos valores en el código, en variables `EXPO_PUBLIC_*`, en issues ni en el chat.

| Nombre | Valor |
| --- | --- |
| `CLUB_DB_URL` | Supabase → **Connect → Session pooler → URI**, puerto **5432**. Puedes dejar `[YOUR-PASSWORD]` en la dirección copiada: el script lo sustituye de forma segura con el secreto siguiente. Debe corresponder al proyecto `corcjvflavfpvzgyvpyb`. No uses Transaction pooler/6543. |
| `CLUB_DB_PASSWORD` | Contraseña de la **base de datos** de ese proyecto. No es la contraseña del entrenador ni la de tu cuenta de Supabase. Si no la recuerdas, utiliza el restablecimiento de contraseña de base de datos en Supabase y actualiza cualquier otro cliente SQL que la utilizase. |
| `CLUB_SUPABASE_KEY` | Una **Secret API key** de servidor (`sb_secret_…`) o la clave legacy **service_role**, desde los ajustes de API del proyecto. Se utiliza exclusivamente en el proceso de copia para leer el almacenamiento privado. La clave Publishable de la aplicación no sirve. |
| `CLUB_BACKUP_PASSWORD` | Contraseña aleatoria de **32 caracteres o más**, generada por un gestor de contraseñas. Guarda una copia en el gestor del club, fuera de GitHub. Será necesaria para abrir cada archivo; si se cambia, las copias anteriores requieren la contraseña anterior. |

Supabase CLI y su instalación se ejecutan antes de exponer secretos al paso de exportación. No es necesario un token personal de Supabase para usar la conexión SQL completa. La clave de Storage nunca se introduce en la web del club.

## 2. Crear y descargar la primera copia

1. Abre **Actions → Copias cifradas del club → Run workflow**, elige `main` y ejecútalo.
2. Espera a que el trabajo termine en verde. Un trabajo omitido o fallido no significa que haya copia.
3. Abre esa ejecución y descarga **Artifacts → inter-club-backup-…**. El ZIP de GitHub contiene un único archivo `inter-club-….tar.gz.enc`.
4. Guarda ese archivo también en una ubicación del club independiente de GitHub, con acceso restringido. Conserva la contraseña por separado.
5. Comprueba su apertura y realiza el ensayo de restauración descrito abajo antes de depender de estas copias.

El repositorio es público: los artifacts también pueden ser accesibles a terceros. Por eso el flujo solo sube el archivo cifrado con AES-256-GCM, con sal y nonce nuevos en cada ejecución y clave derivada con PBKDF2-HMAC-SHA256 (600 000 iteraciones). Nunca subas a GitHub la carpeta recuperada ni SQL en claro. El flujo descifra y compara el paquete recién generado antes de subirlo; además verifica archivos, tablas necesarias y que las imágenes referenciadas por el SQL estén presentes. Esto comprueba integridad, no sustituye un ensayo de recuperación del servicio.

## 3. Activar las copias diarias

Tras una primera ejecución correcta, abre **Settings → Secrets and variables → Actions → Variables → New repository variable** y crea `CLUB_BACKUPS_ENABLED` con valor `true`.

Se programan a las **03:23 UTC** (03:23 en Canarias en invierno y 04:23 en verano). GitHub puede retrasar las ejecuciones; no es una garantía de hora ni una copia continua. Se conservan artifacts durante **30 días**, sujetos a los límites de la cuenta y del repositorio. Copia periódicamente uno fuera de GitHub para conservar un punto independiente.

Revisa **Actions** regularmente y activa los avisos de fallos de workflows en las notificaciones de tu cuenta. En repositorios públicos GitHub puede desactivar tareas programadas después de 60 días sin actividad; revisa que la programación siga habilitada. Un proyecto Supabase pausado, credenciales caducadas, límites de recursos o fallos de red harán fallar la copia. El flujo no marca como completada una exportación parcial. No se ha configurado envío de correos desde la aplicación.

El proceso vuelve a descargar las imágenes en cada copia completa: consume tráfico de Storage. Revisa el consumo del plan Free; si crece la biblioteca, ajusta la frecuencia o pasa a una estrategia incremental con un almacenamiento privado dedicado. No se presupone que cualquier volumen sea gratuito. Para detener las ejecuciones programadas cambia `CLUB_BACKUPS_ENABLED` a `false`.

## 4. Abrir y comprobar una copia en un ordenador

Requiere **Node.js 24**, Git y `tar`; para restaurar SQL, también `psql`. Descarga el código desde GitHub o extrae la versión correspondiente. La carpeta de recuperación debe ser nueva y estar fuera de una carpeta sincronizada públicamente. No necesitas conectarte a Supabase para abrir o verificar el archivo.

En Bash, introduce la contraseña sin mostrarla en pantalla:

```bash
read -rs -p 'Contraseña de la copia: ' CLUB_BACKUP_PASSWORD
export CLUB_BACKUP_PASSWORD
node scripts/backup/recover.mjs open /ruta/inter-club-COPIA.tar.gz.enc /ruta/privada/recuperacion-nueva
unset CLUB_BACKUP_PASSWORD
node scripts/backup/recover.mjs verify /ruta/privada/recuperacion-nueva
```

Una contraseña incorrecta o alteración del archivo no produce una recuperación válida. El comando no se conecta a Supabase ni restaura datos por sí solo. La carpeta abierta contiene información privada y debe custodiarse igual que la base de datos.

## 5. Ensayo de restauración en un proyecto NUEVO

No restaures sobre el proyecto en uso. Crea un proyecto de prueba separado, con una versión de Postgres compatible, y comprueba los límites de tu organización antes de crearlo. El ensayo real requiere que el propietario configure ese proyecto: publicar este flujo no lo crea ni demuestra que se haya restaurado un proyecto del club.

1. Sigue [la guía oficial de restauración lógica de Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Conecta `psql` al **proyecto nuevo** usando su Session pooler/5432, TLS y una contraseña introducida fuera del historial del terminal. Usa una conexión con la autoridad requerida para restaurar los datos de Auth y Storage.
2. Desde la carpeta verificada, importa en una sola transacción y detén ante cualquier error:

   ```bash
   psql --dbname="$CLUB_RESTORE_DB_URL" --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' --file data.sql
   psql --dbname="$CLUB_RESTORE_DB_URL" --variable ON_ERROR_STOP=1 --file backup-managed-objects.sql
   ```

   La URL debe apuntar al proyecto **nuevo**; configura su contraseña de SQL con las herramientas de tu equipo, sin escribirla en los comandos. Revisa cualquier error siguiendo la guía oficial: las versiones del servicio, extensiones y roles gestionados pueden requerir ajustes. `managed-schema-reference.sql` es una referencia completa de Auth/Storage; **no se importa en bloque** sobre los esquemas gestionados del proyecto nuevo. `backup-managed-objects.sql` reconstruye el trigger de alta de entrenadores y las dos políticas del bucket del club que usan funciones restauradas desde `public`.

3. Configura `CLUB_RESTORE_URL` con la URL pública del proyecto **nuevo** y `CLUB_RESTORE_KEY` con su Secret API key/service_role, solo en el entorno del ordenador. Ejecuta desde el código:

   ```bash
   node scripts/backup/recover.mjs images /ruta/privada/recuperacion-nueva
   ```

   Rechaza el proyecto original. Sube las imágenes a las mismas rutas dentro del bucket privado restaurado y admite repetir la subida en el proyecto de ensayo. Esto es necesario incluso aunque `storage.objects` ya tenga sus referencias SQL.

4. Recupera `code.tar.gz`, comprueba su commit en `manifest.json` y configura una copia local de la web con la URL y la clave Publishable del proyecto de ensayo. Despliega en ese proyecto la función `club-users`, con `verify_jwt=false` como indica `config.toml`. Los secretos integrados de la función deben corresponder al proyecto nuevo.
5. Revisa en Auth el alta pública, **Site URL**, las URL de recuperación permitidas y la política de contraseña. Las sesiones antiguas pueden requerir iniciar sesión de nuevo; comprueba que las cuentas restauradas permiten entrar. Configura el resto de ajustes externos que usase el club.
6. Comprueba un administrador, un entrenador y un revisor; sus equipos, asistencia, minutos, favoritos, categorías y revisiones; un plan antiguo con imagen, su PDF y la creación de un usuario de prueba. Comprueba que un entrenador no accede a equipos ajenos y que Storage permanece privado.
7. Registra fecha, archivo usado, resultado y pasos que requirieron ajustes. Haz el primer ensayo al activar las copias y repítelo periódicamente y tras cambios importantes del servicio.

La exportación de datos es una instantánea lógica consistente; roles/esquema y archivos se recogen en pasos separados. Evita aplicar migraciones o borrar imágenes manualmente durante la copia. Las imágenes del club son inmutables y se retienen para el historial, lo que permite copiar los archivos necesarios tras exportar las referencias. No hay recuperación punto a punto ni garantía de recuperar cambios posteriores a la última copia correcta.

## Referencias oficiales

- [Copias de Supabase y límites de los planes](https://supabase.com/docs/guides/platform/backups).
- [Exportación y restauración, personalizaciones de Auth/Storage y archivos](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- [Artifacts de GitHub Actions y sus límites](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts).
