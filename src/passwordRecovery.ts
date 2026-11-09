export const PASSWORD_RECOVERY_REDIRECT = 'https://emmanueltejero.github.io/aplicacionInter/?password_reset=1';

// A UI hint only. A valid Supabase session is still required to update a password.
export function hasRecoveryIntent(search: string, hash: string): boolean {
  return new URLSearchParams(search).get('password_reset') === '1'
    || new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery';
}

export function validateNewPassword(password: string, confirmation: string): void {
  if (Array.from(password).length < 8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
  if (password !== confirmation) throw new Error('Las dos contraseñas no coinciden.');
}
