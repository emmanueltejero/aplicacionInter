# ChatGPT → Inter Playa Honda: MCP autenticado de solo consulta

Estado: **implementado y probado localmente; falta activar OAuth, aplicar SQL y desplegar la función en el proyecto real**. No se han consultado nombres, asistencia ni minutos reales. La consulta pública del 13/11/2026 encontró JWKS ES256 disponible, discovery OAuth 404 y `club-mcp` 404.

URL prevista, **no operativa hasta completar estos pasos**:

`https://corcjvflavfpvzgyvpyb.supabase.co/functions/v1/club-mcp`

Se aloja en las Edge Functions del Supabase actual, opción elegida por el propietario. No se ha contratado ningún servicio. Supabase documenta que la autenticación MCP no tiene un cargo independiente: cuenta en usuarios activos y las funciones consumen las cuotas del plan. Revisar uso y facturación antes de ampliar el plan; esta implementación no lo cambia. GitHub Pages sigue sirviendo la aplicación y el consentimiento, pero no puede ejecutar el servidor MCP.

## 1. Archivos y garantías

- `functions/club-mcp/`: SDK oficial MCP 2.4.0, Streamable HTTP, OAuth discovery RFC 9728 y JWT asimétricos. Negocia también el protocolo 2025-11-25.
- `migrations/202611130001_club_mcp.sql`: rol `club_mcp_reader` sin login/escritura, políticas SELECT que reutilizan **can_access_team**, hook OAuth y una lectura consistente por herramienta. Las tablas de datos actuales no se modifican.
- `mcp-client.example.sql`: alta de un cliente OAuth autorizado (su UUID es público).
- `/aplicacionInter/oauth/consent/`: pantalla de inicio de sesión y consentimiento, publicada con la aplicación. Solo navega a los callbacks HTTPS de ChatGPT admitidos.

El servidor no usa `service_role`, Secret key ni contraseñas. Verifica firma ES256/RS256, issuer de este proyecto, audience exacta de su URL, caducidad, identidad y rol/cliente OAuth. Rechaza tokens normales de la app, ID tokens y tokens administrativos. El JWT de lectura identifica al usuario en el mismo backend Supabase y RLS; no se envía a terceros ni se acepta ningún token arbitrario para reutilizarlo con otros servicios.

El permiso vivo se comprueba en cada petición y en RLS: cuenta habilitada, cliente OAuth habilitado y equipos permitidos. Un entrenador solo accede a sus asignaciones; un administrador accede a los equipos del club, también por este canal **sin poder editar**. No hay SQL libre, comandos, herramientas de escritura, claves privadas ni datos personales en código, ejemplos o CI. Solo el metadata OAuth es público; herramientas y datos requieren autenticación.

## 2. Publicar la pantalla y ejecutar la migración

1. Tener publicada la versión de la web que incluye `/aplicacionInter/oauth/consent/` (la publicación habitual de `main` la genera). Ese directorio contiene un puente estático hacia la entrada principal, conservando `authorization_id` y el resto de la query. La raíz muestra el consentimiento cuando recibe esa solicitud; evita depender de una ruta SPA anidada al abrir desde Supabase. Sin `authorization_id`, el enlace abre la aplicación habitual y no pide autorizar a ningún cliente.
2. En Supabase → **SQL Editor → New query**, ejecutar **todo** `supabase/migrations/202611130001_club_mcp.sql`. Es repetible y conserva el historial. No vuelvas a ejecutar el SQL inicial del club.
3. No conceder `authenticated` al nuevo rol ni SELECT/EXECUTE adicionales. El rol necesita pertenecer a `authenticator` para que PostgREST lo seleccione; la migración lo prepara.

## 3. Activar Supabase Auth como servidor OAuth

En Supabase → **Authentication → OAuth Server**:

1. Activar el servidor OAuth 2.1.
2. **Authorization Path**: `/aplicacionInter/oauth/consent/`. Mantener **Site URL** en `https://emmanueltejero.github.io/aplicacionInter/`. Supabase abre `https://emmanueltejero.github.io/aplicacionInter/oauth/consent/?authorization_id=...` y el puente lleva a `https://emmanueltejero.github.io/aplicacionInter/?authorization_id=...`, donde se muestra el consentimiento. El path incluye el repositorio porque es una URL de GitHub Pages. La corrección del puente no requiere cambiar esa configuración.
3. Mantener las claves asimétricas de firma (actualmente ES256). Nunca copiar la clave de firma, una Secret key ni `service_role` a ChatGPT.
4. Activar **Allow Dynamic Client Registration (DCR)**, la vía de conexión automática documentada por Supabase y el ejemplo oficial de OpenAI. Puede registrar clientes nuevos, pero **el registro no da acceso a los datos**: nuestro hook y la lista permitida impiden usar clientes no habilitados.
5. Una vez desplegada la función (paso 4), crear la app OAuth en ChatGPT (paso 5), sin rellenar Client ID/Secret si la interfaz permite registro automático. ChatGPT registrará su cliente y abrirá nuestra pantalla. Iniciar sesión: la pantalla mostrará que falta habilitar el cliente y su **UUID público**, con el botón de autorizar bloqueado.
6. Copiar `supabase/mcp-client.example.sql` en Supabase → SQL Editor, sustituir `REPLACE_WITH_OAUTH_CLIENT_UUID` por ese UUID y ejecutar. No introducir ningún secreto en esa query. Volver a la pantalla y pulsar **Reintentar autorización**; entonces podrá autorizarse. No habilitar clientes desconocidos.

**Alternativa con cliente predefinido:** si ChatGPT ofrece campos Client ID / Client Secret y se prefiere no usar DCR, crear un cliente **confidential** en Supabase, nombre `ChatGPT · Inter Playa Honda`, con authorization code, refresh token, PKCE S256 y `client_secret_post` (o el método anunciado por discovery que admita el cliente). Registrar el callback exacto que muestra ChatGPT, sin comodines. La versión actual admite `https://chatgpt.com/connector_platform/oauth/callback` y el mismo path en `https://chat.openai.com`. Si muestra otra URL, adaptar primero `src/oauthConsent.ts` y sus pruebas. Habilitar su UUID con el mismo SQL de ejemplo y guardar el Client Secret en el gestor de contraseñas, introduciéndolo **solo en los ajustes OAuth de ChatGPT**, nunca en chat/código. El MCP no necesita ese secreto. Si se usa esta vía puede mantenerse DCR desactivado.

### Hook de tokens obligatorio

En **Authentication → Hooks → Custom Access Token**, elegir el hook PostgreSQL `public.club_mcp_access_token_hook`. Si ya existe otro hook, integrar esta lógica antes de sustituirlo; no se ha podido consultar esa configuración privada. La nueva función no se activa solo por ejecutar SQL.

Para clientes de la lista permitida, el hook emite audience = URL MCP, `role=club_mcp_reader` y `club_mcp_read=true`, también al renovar tokens. Los logins y recuperaciones normales de la app no se alteran. **Otros clientes del servidor OAuth se rechazan**: si el club añade otra integración OAuth, debe ampliar deliberadamente la política. No configurar un cliente OAuth que conserve el rol de edición de la aplicación.

Los scopes OAuth solicitados son `openid`; identifican el flujo de autenticación y **no** otorgan acceso a tablas. La autorización real está en el rol, la lista de clientes, la cuenta y RLS. No se solicitan scopes de escritura, email ni profile. Un ID token con audience = Client ID no sirve para el MCP.

## 4. Desplegar la Edge Function

**No necesitas instalar programas ni usar la terminal de tu ordenador.** El workflow [Publicar conexión con ChatGPT](https://github.com/emmanueltejero/aplicacionInter/actions/workflows/mcp-deploy.yml) instala la CLI y empaqueta el servidor dentro de GitHub Actions.

1. Abre [Supabase → Account → Access Tokens](https://supabase.com/dashboard/account/tokens) y crea un token para desplegar la función. Si se ofrecen tokens con ámbito, limita el acceso al proyecto del club y a los permisos que pide el despliegue de Edge Functions (`edge_functions_write`; `projects_read` y lecturas de proyecto/rama si las solicita la CLI). No uses la contraseña de la base de datos ni una API key `service_role`. Si solo se ofrece un token personal de cuenta, ten en cuenta que tiene permisos más amplios: consérvalo únicamente en los secretos de GitHub y puedes revocarlo al terminar; se necesitará otro para futuras publicaciones.
2. Abre [crear secreto de GitHub Actions](https://github.com/emmanueltejero/aplicacionInter/settings/secrets/actions/new). **Name**: `CLUB_MCP_DEPLOY_TOKEN`. **Secret**: el token que acabas de crear. Pulsa **Add secret**. No lo pegues en este chat, en archivos ni en variables públicas.
3. Abre [Publicar conexión con ChatGPT](https://github.com/emmanueltejero/aplicacionInter/actions/workflows/mcp-deploy.yml), pulsa **Run workflow**, selecciona **main** y confirma **Run workflow**.
4. Espera al resultado verde. El flujo primero ejecuta las pruebas y luego publica **solo `club-mcp`** en el proyecto fijo del club. Usa la API de empaquetado, sin Docker ni programas en tu dispositivo. Comprueba únicamente que la función exige autenticación y devuelve metadatos públicos correctos. No consulta datos reales, ejecuta SQL ni configura OAuth. Si falta el secreto, muestra su nombre y se detiene sin publicarlo.

El token solo se entrega al paso de despliegue, después de instalar la CLI. No se imprime ni se entrega a las pruebas. La comprobación posterior no tiene ese token y no autentica como un entrenador. El workflow solo se ejecuta manualmente desde `main`; no publica automáticamente con cada cambio.

**Alternativa para quien ya utilice una terminal:** con Supabase CLI 3.1.0, desde la raíz del repositorio, `supabase login` y después `supabase functions deploy club-mcp --remote=corcjvflavfpvzgyvpyb --no-verify-jwt --use-api --yes`. El argumento actual es `--remote`; la opción antigua `--project-ref` de versiones anteriores no se debe copiar en esta versión. La terminal y `supabase link` no son requisitos para usar el botón de GitHub. No ejecutar `db push` para reaplicar todo el historial de migraciones gestionadas manualmente.

`verify_jwt=false` es intencionado: discovery debe funcionar sin sesión y el gateway no sustituye nuestras verificaciones de issuer/audience/rol. La función valida cada JWT y el acceso antes de exponer herramientas. Usa `SUPABASE_URL` y las Publishable/anon keys que Supabase proporciona. No añadir Secret key ni service key. `CLUB_MCP_RESOURCE_URL` es opcional; el valor calculado ya coincide con la URL pública. Si se cambia el dominio, actualizarlo también en la lista SQL y renovar las autorizaciones.

El workflow usa la CLI para empaquetar también los módulos de cálculo originales de `src/`. **No pegar únicamente `index.ts` en el editor web**: faltaría el resto del servidor y los módulos compartidos.

Comprobar sin token (solo metadata, sin datos personales):

```bash
curl -i https://corcjvflavfpvzgyvpyb.supabase.co/functions/v1/club-mcp
# Debe dar 401 y WWW-Authenticate con resource_metadata.
curl https://corcjvflavfpvzgyvpyb.supabase.co/functions/v1/club-mcp/.well-known/oauth-protected-resource
# resource = URL MCP, authorization_servers = [URL Supabase/auth/v1].
curl https://corcjvflavfpvzgyvpyb.supabase.co/.well-known/oauth-authorization-server/auth/v1
# Debe dar 200 y endpoints de autorización/token, no 404.
```

## 5. Conectar en ChatGPT

En **ChatGPT web → Ajustes → Apps (o Conectores) → Configuración avanzada**, activar **Modo desarrollador** si el plan/espacio de trabajo lo permite. En espacios gestionados, el administrador debe permitir apps MCP personalizadas. Crear una app:

- Nombre: `Inter Playa Honda`.
- URL MCP: `https://corcjvflavfpvzgyvpyb.supabase.co/functions/v1/club-mcp`.
- Autenticación: **OAuth**. Usar registro automático DCR dejando Client ID / Client Secret vacíos. Si se eligió expresamente el cliente predefinido, introducir sus credenciales solo en esos ajustes.
- Conectar, iniciar sesión **en la página del club**, comprobar nombre del cliente y cuenta y pulsar **Autorizar consultas en ChatGPT**. La contraseña del entrenador no se introduce en ChatGPT ni en la URL MCP.

Seleccionar la app en la conversación (menú **+ / Más / Apps**, según interfaz). No se requiere subir una base de datos ni se duplica en el servidor MCP. ChatGPT sí recibe los resultados de las consultas solicitadas: el consentimiento lo indica. La web privada y el acceso habitual del club siguen funcionando de forma independiente.

Consulta inicial:

> Con Inter Playa Honda, lista mis equipos. Después consulta el resumen del Alevín B del 1 al 13 de noviembre de 2026. Indica el equipo y sus identificadores, el período, la fecha de corte, asistencias, porcentaje, partidos jugados, minutos totales, media por partido y registros pendientes. Desglosa después los minutos de cada partido y consulta todas las páginas si hay más resultados. Si no tengo acceso, indícalo sin usar otro equipo.

Si ese equipo no existe o no está asignado, usar el nombre de uno devuelto por `list_teams` y su UUID; no inventarlo. El asistente puede preparar propuestas de entrenamientos/partidos en la conversación, pero esta integración no las guarda en la app.

## 6. Herramientas y reglas de cálculo

| Herramienta | Datos |
| --- | --- |
| `list_teams` | Equipos autorizados; opcionalmente archivados. No incluye contactos ni cuentas. |
| `get_roster` | UUID, nombre, dorsal y archivo de la plantilla actual; activos por defecto. No reconstruye una plantilla pasada. |
| `get_player_summary` | Asistencia y minutos con `attendanceReport` y `matchTotals` originales, incluyendo archivados por defecto. |
| `get_attendance` | Marcas por día, sin marcar explícito; filtro opcional de jugador y páginas. |
| `get_match_minutes` | Rival, fecha, duración, local/visitante, disputado, minutos por convocado, pendientes y si cuentan en totales; filtros opcionales de partido/jugador y páginas. |

Las consultas de datos exigen `team_id`. `from` y `to` son fechas inclusivas `YYYY-MM-DD`; vacías/ausentes significan todo el historial. `as_of` por defecto es hoy en **Atlantic/Canary**, admite corte histórico y rechaza uno futuro. Se excluyen los registros posteriores al corte aunque `to` sea posterior. El estado actual de archivo/plantilla sigue el mismo filtro que la pantalla; no equivale a una reconstrucción histórica.

Porcentaje = presentes ÷ registros completados × 100; justificadas cuentan como no asistidas; sin marcar y futuro se excluyen; porcentaje sin datos = null. Los pendientes de asistencia solo se calculan sobre días con alguna marca del listado filtrado, sin inferir sesiones planificadas.

Partidos: solo disputados hasta el corte. Jugados por jugador = partidos con minutos > 0. Media = minutos conocidos ÷ esos partidos. 0 no aumenta el divisor; null es pendiente y no se transforma en 0. Si todas las convocatorias tienen minutos pendientes, minutos totales = null, equivalente al guion de la app. Las medias conservan precisión numérica; la interfaz redondea al mostrarlas.

Asistencia y detalle de partidos tienen `page` (desde 1), `page_size` (1–50, por defecto 20), `total_items` y `has_more`; los pendientes son del conjunto filtrado completo, no solo de la página. Hay que recorrer las páginas. Una consulta excesiva devuelve error y pide acotar el período; no devuelve un total parcial disfrazado de completo. Las listas de equipos se leen completas con paginación de base de datos. El RPC de detalle evita truncamiento por el límite REST de filas y mezcla de cargas parciales.

Las respuestas incluyen equipo, intervalo, corte, zona horaria, generación y pendientes. Para equipos/plantilla, pendientes = null con `not_queried` porque no se han consultado esas estadísticas; `list_teams` no tiene período aplicable. Ningún error de conexión/permisos se interpreta como cero registros.

## 7. Verificación y revocación

Pruebas reproducibles sin secretos ni datos reales (Node 24 y Deno 2.9.6 para la comprobación de runtime):

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm ci --prefix supabase/functions/club-mcp --ignore-scripts
npm run typecheck --prefix supabase/functions/club-mcp
npm test --prefix supabase/functions/club-mcp
deno check --config supabase/functions/club-mcp/deno.json supabase/functions/club-mcp/index.ts
deno run --allow-env --config supabase/functions/club-mcp/deno.json supabase/functions/club-mcp/tests/deno-smoke.ts
```

Probado localmente: ejecución Deno con JWT y backend ficticios, cliente oficial MCP y transporte 2025, firmas ES256 de prueba, rechazos de token/issuer/audience/rol/origen, valores y pendientes, filtros, RPCs/RLS en PostgreSQL PGlite con todas las migraciones, aislamiento entre entrenadores, lectura del admin sin escritura, revocación viva e idempotencia SQL. También han pasado la suite de la aplicación y las pruebas de consentimiento en Chromium móvil: login, aprobación explícita, denegación, cliente no habilitado y callback no admitido, con respuestas de Auth simuladas. No equivalen a una autorización real de Supabase. `.github/workflows/mcp-checks.yml` repite las pruebas de servidor en CI; **no despliega ni usa secretos**.

Falta verificar en producción: activación OAuth, hook y cliente, despliegue Edge, renovación real del token y el recorrido completo dentro de ChatGPT con una cuenta del club. Tras conectarlo, comparar un mismo equipo/intervalo con **Resumen** y el detalle de **Partidos**; probar un entrenador asignado y otro no asignado, y denegar una autorización. Esto requiere las cuentas/autorizaciones reales y no se ha simulado como una prueba real.

Para retirar acceso, desconectar/revocar la app en ChatGPT/Supabase OAuth. Además, el administrador puede poner `enabled=false` en `club_mcp_oauth_clients` y se bloquean inmediatamente los siguientes accesos en MCP y RLS; deshabilitar una cuenta o quitar su asignación también se comprueba en cada petición. La sola revocación de un refresh token no garantiza invalidar instantáneamente todos los access tokens JWT ya emitidos: mantener el control vivo de la tabla y un tiempo de expiración corto.

La configuración OAuth/hook del dashboard y los secretos del cliente deben documentarse en el gestor del club para recuperación. No se da por hecho que el volcado ordinario restaure automáticamente esa configuración externa. Los datos nuevos de autorización no se hacen públicos y los backups se mantienen cifrados.

## Documentación oficial consultada (13/11/2026)

Los dominios de documentación directa devolvieron 403 en este entorno; se leyeron sus fuentes oficiales vigentes en GitHub, no tutoriales externos:

- [OpenAI: ejemplo autenticado oficial](https://github.com/openai/openai-apps-sdk-examples/tree/main/authenticated_server_python), incluyendo el README y `main.py`, que documentan discovery, OAuth y los metadatos de autenticación; [guía de autenticación enlazada por el ejemplo](https://developers.openai.com/apps-sdk/build/auth/).
- [Supabase: OAuth para MCP](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/oauth-server/mcp-authentication.mdx) y [despliegue Edge MCP](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/ai-tools/byo-mcp.mdx).
- [Supabase: configuración OAuth](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/oauth-server/getting-started.mdx), [seguridad de tokens/RLS y audience](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/oauth-server/token-security.mdx) y [hook de tokens](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-hooks/custom-access-token-hook.mdx).
- [SDK MCP TypeScript actual](https://github.com/modelcontextprotocol/typescript-sdk), versión instalada 2.4.0 (la línea 2 implementa el protocolo 2026-07-28); [autorización MCP 2025-11-25](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/basic/authorization.mdx), compatible con el cliente anterior. No se afirma haber leído una especificación 2026 que no estaba disponible en la ruta consultada.

No se usa el MCP de administración de Supabase: esta función expone únicamente las cinco consultas del club.
