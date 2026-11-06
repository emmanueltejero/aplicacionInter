# Inter Playa Honda · Entrenadores

Primera versión de la aplicación del club, creada con React Native, Expo y TypeScript para Android, iOS y web.

## Estado actual

- Pantalla de acceso por correo/contraseña con Supabase y recuperación de sesión. Sin alta pública desde la app; el club gestiona las cuentas.
- Equipos asignados al entrenador y gestión de jugadores: alta, edición, archivo y restauración. Archivar conserva las asistencias.
- Dorsales únicos entre jugadores activos; errores de validación y guardado visibles.
- Asistencia por fecha con estados presente, ausente o justificado; pendientes separados.
- Base de datos y políticas RLS en `supabase/`. Consulta [la guía de conexión](supabase/README.md) para crear las tablas, la primera cuenta y las asignaciones.
- Demo independiente con datos ficticios y persistencia local; no se mezclan sus registros con los del club.

La integración remota requiere configurar la URL, la clave pública y el esquema en tu proyecto Supabase. Las pruebas locales no acreditan que esa conexión ya esté operativa. No introducir datos reales hasta completar la validación remota indicada en la guía.

## Desarrollo

Node.js 24 LTS y npm. Desde `/workspace/aplicacionInter`:

```sh
npm ci
npm run typecheck
npm test
npm start
```

Abre el proyecto con una versión de Expo Go compatible con el SDK 58 en Android o iOS. El móvil debe poder alcanzar el servidor de desarrollo: el entorno en la nube no garantiza ese acceso. Para una instalación independiente será necesario preparar builds firmadas y las cuentas de distribución. No se han generado ni probado binarios nativos.

Para validar desde el entorno sin móvil:

```sh
EXPO_OFFLINE=1 npm run build
EXPO_OFFLINE=1 npm run web -- --host localhost --port 8081
```

El modo offline de Expo evita consultas auxiliares de metadatos; no desactiva verificaciones TLS ni de paquetes. En este entorno las dependencias se obtienen de `registry.npmjs.org`. No es necesaria ninguna clave para la demostración. El acceso real requiere las variables públicas de `.env.example` y la configuración descrita en `supabase/README.md`.

## Próximas fases acordadas

1. Conectar y validar en el proyecto real las cuentas, equipos y plantillas ya implementados; después, resumen individual de asistencia. Las altas de entrenador se gestionan desde el club.
2. Partidos y registro de minutos de cada jugador.
3. Biblioteca de ejercicios compartida: todos los entrenadores pueden aportar y utilizar ejercicios. Propuesta inicial: cada autor edita sus ejercicios y el administrador gestiona todos.
4. Planificador de sesiones con categorías, duración, material, jugadores y espacio. Cada sesión conservará una copia del ejercicio para que posteriores ediciones no cambien sesiones existentes. Definir las reglas de recursos para ejercicios simultáneos y consecutivos.

El esquema y las políticas están implementados y probados localmente. Su aplicación y validación en Supabase, el panel administrativo dentro de la app y las pruebas en dispositivos físicos quedan pendientes. El nombre e identificadores de aplicación son provisionales; no se ha publicado en ninguna tienda.

## Demostración portátil

La interfaz usa azul y negro como colores del club. La cabecera usa el escudo original del club, conservado sin modificaciones en `assets/club-crest.jpg`. La demo portátil incluye la imagen dentro del HTML y no necesita descargarla de Internet.

```sh
npm run demo:build
```

Genera `dist-portable/inter-playa-honda-demo.html`, un único archivo HTML sin recursos externos. Usa los jugadores y reglas de asistencia de `src/domain.ts`; permite probar fechas, alta/edición/archivo/restauración de jugadores y asistencia. Si el visor bloquea almacenamiento, avisa y mantiene las marcas durante la sesión. Es una demostración del flujo, no una aplicación instalada ni un sustituto de la versión Expo.

Para distribuir como web instalable (PWA) todavía faltan el alojamiento HTTPS, el manifiesto con los iconos oficiales y la estrategia de actualización. El uso sin conexión y la sincronización de cambios con el servidor requieren diseño y pruebas específicos. No se ha desplegado una PWA ni publicado en tiendas.

## Comprobación descargable del acceso real

```sh
npm run access:build
```

Genera `dist-portable/inter-playa-honda-acceso.html`. Usa únicamente la URL y la clave pública configuradas; incorpora el escudo sin recursos externos. La persona introduce su contraseña en su navegador y esta se envía por HTTPS solo a su proyecto Supabase. Consulta su membresía y equipos, y cierra únicamente la sesión temporal de esa comprobación (`scope=local`). El archivo no escribe contraseñas ni tokens en almacenamiento del navegador y no modifica jugadores ni asistencias. Requiere conexión a Internet; no es la aplicación completa ni una PWA desplegada.

El 6 de noviembre de 2026, desde el entorno restaurado, Supabase respondió HTTP 200 a salud y configuración pública. Las consultas sin sesión a equipos y jugadores fueron rechazadas con HTTP 401 y código PostgreSQL 42501. La comprobación CORS permitió origen de navegador. Esto verifica conectividad, clave pública y rechazo de lecturas anónimas, pero no acredita un inicio de sesión real: la validación de la cuenta requiere que su propietario introduzca su contraseña.

El flujo de este archivo se probó en navegador con respuestas simuladas para acceso correcto, contraseña incorrecta y error al consultar datos, verificando vaciado de contraseña, ausencia de almacenamiento, cierre de sesión y ancho móvil. Las contraseñas de esas pruebas son ficticias.

## Publicación web con GitHub Pages (preparada, pendiente de autorización)

La preparación usa el repositorio público `emmanueltejero/aplicacionInter`. La dirección prevista, una vez activado y completado el despliegue, es `https://emmanueltejero.github.io/aplicacionInter/`. Esta preparación no acredita que la web ya esté publicada.

`app.config.ts` conserva `app.json` y permite exportar el sitio con la ruta del repositorio mediante `EXPO_BASE_PATH`. Para reproducir el resultado:

```sh
EXPO_OFFLINE=1 npm run build:pages
```

El directorio `dist/` contiene la web y el escudo; `.nojekyll` permite servir los recursos `_expo` y `404.html` proporciona la entrada para rutas. El flujo `.github/workflows/pages.yml` instala, valida, prueba y despliega únicamente `dist`, usando Node 24. Incluye la URL y la clave **Publishable**, que son configuración pública de cliente. No utiliza contraseñas ni credenciales `service_role`; los datos del club permanecen sujetos a los permisos de Supabase.

Antes del primer despliegue, el propietario debe activar **Settings → Pages → Build and deployment → Source: GitHub Actions** en GitHub. Tras autorizar la subida del código a `main`, el flujo de Actions realiza la publicación. Revisar el resultado del flujo y probar el sitio HTTPS real antes de darlo por operativo. Esta versión no tiene todavía manifiesto ni caché offline de PWA.

La publicación del entorno de Codex y la publicación de esta web son operaciones distintas. Los archivos descargables del chat son auxiliares y no se necesitan para usar el sitio alojado.
