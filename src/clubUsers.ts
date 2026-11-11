export type ClubUser = { id: string; email: string; name: string; role: 'admin' | 'coach'; enabled: boolean; teamIds: string[]; canReviewExercises?: boolean };
export type CoachAccountDraft = { id: string; email: string; name: string; password: string; teamIds: string[] };
export type CoachAccountResult = { id: string; email: string; replayed: boolean };
export type CoachAccessUpdate = { id: string; enabled: boolean; teamIds: string[]; expectedEnabled: boolean; expectedTeamIds: string[] };
export type CoachAccessResult = { id: string; enabled: boolean; teamIds: string[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateCoachAccess(request: CoachAccessUpdate): CoachAccessUpdate {
  if (!uuid.test(request.id) || typeof request.enabled !== 'boolean' || typeof request.expectedEnabled !== 'boolean') throw new Error('No se pudo preparar el cambio de acceso. Actualiza los usuarios.');
  for (const [ids, limit] of [[request.teamIds, 20], [request.expectedTeamIds, 1000]] as const) {
    if (!Array.isArray(ids) || ids.length > limit || new Set(ids).size !== ids.length || ids.some(id => !uuid.test(id))) throw new Error('Revisa los equipos seleccionados. Puedes asignar hasta 20 equipos distintos.');
  }
  return { ...request, teamIds: [...request.teamIds].sort(), expectedTeamIds: [...request.expectedTeamIds].sort() };
}
function passwordBytes(value: string) {
  let bytes = 0;
  for (const char of value) { const point = char.codePointAt(0)!; bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4; }
  return bytes;
}
export function validateCoachAccount(draft: CoachAccountDraft): CoachAccountDraft {
  const email = draft.email.trim().toLowerCase(), name = draft.name.trim().replace(/\s+/g, ' ');
  if (!uuid.test(draft.id)) throw new Error('No se pudo preparar el alta. Cierra el formulario y vuelve a abrirlo.');
  if (!name || name.length > 80) throw new Error('Escribe un nombre de entre 1 y 80 caracteres.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo electrónico válido.');
  if ([...draft.password].length < 8 || passwordBytes(draft.password) > 72) throw new Error('La contraseña debe tener al menos 8 caracteres y un máximo de 72 bytes.');
  if (!draft.teamIds.length || draft.teamIds.length > 20 || new Set(draft.teamIds).size !== draft.teamIds.length || draft.teamIds.some(id => !uuid.test(id))) throw new Error('Selecciona entre 1 y 20 equipos distintos.');
  return { ...draft, email, name, teamIds: [...draft.teamIds].sort() };
}
export class UsersSetupRequired extends Error {
  part: 'database' | 'function';
  constructor(part: 'database' | 'function') {
    super(part === 'database' ? 'Falta activar la gestión de usuarios en Supabase.' : 'Falta desplegar la función club-users en Supabase.');
    this.name = 'UsersSetupRequired'; this.part = part;
  }
}
export class UsersRequestFailure extends Error {
  retryable: boolean;
  constructor(message: string, retryable = false) { super(message); this.name = 'UsersRequestFailure'; this.retryable = retryable; }
}
export function userCreationFailure(code: string): Error {
  const messages: Record<string, string> = {
    SESSION_INVALID: 'Vuelve a iniciar sesión para gestionar los usuarios.',
    FORBIDDEN: 'Solo los administradores activos del club pueden crear usuarios.',
    EMAIL_EXISTS: 'Ya existe una cuenta con ese correo. No se ha cambiado su contraseña ni su acceso.',
    EMAIL_INVALID: 'Escribe un correo electrónico válido.', NAME_INVALID: 'Escribe un nombre de entre 1 y 80 caracteres.',
    PASSWORD_INVALID: 'La contraseña debe tener al menos 8 caracteres y un máximo de 72 bytes.',
    PASSWORD_POLICY: 'La contraseña no cumple los requisitos de Supabase. Prueba una más larga con mayúsculas, minúsculas, números y símbolos.',
    TEAMS_INVALID: 'Algún equipo ya no está disponible. Actualiza los usuarios y revisa la selección.',
    REQUEST_CONFLICT: 'Este intento ya creó una cuenta con otros datos. Cierra el formulario y actualiza los usuarios.',
  };
  if (code === 'SETUP_REQUIRED') return new UsersSetupRequired('database');
  if (code === 'SERVER_CONFIG') return new UsersSetupRequired('function');
  if (messages[code]) return new UsersRequestFailure(messages[code]);
  return new UsersRequestFailure('No se pudo confirmar el alta. Reintenta con los mismos datos o actualiza la lista para comprobar si se creó.', true);
}
