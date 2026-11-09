export type AuthFailure = { message: string; code: string; status: number | null };

// Only display known codes/statuses, never the raw exception, request, or session.
export function describeAuthFailure(error: unknown): AuthFailure {
  const details = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const status = typeof details.status === 'number' && Number.isInteger(details.status)
    && details.status >= 100 && details.status <= 599 ? details.status : null;
  const receivedCode = typeof details.code === 'string' ? details.code : details.error_code;
  const messages: Record<string, string> = {
    invalid_credentials: 'El correo o la contraseña no coinciden. Comprueba la cuenta creada en Authentication → Users del proyecto del club.',
    email_not_confirmed: 'El correo de esta cuenta todavía no está confirmado. Revisa su confirmación en Authentication → Users de Supabase.',
    weak_password: 'La nueva contraseña no cumple los requisitos de Supabase. Elige otra más larga y variada.',
    same_password: 'La nueva contraseña debe ser distinta de la anterior.',
    otp_expired: 'El enlace ha caducado o ya se ha utilizado. Solicita un enlace nuevo.',
    reauthentication_needed: 'Vuelve a verificar tu acceso con un enlace de recuperación nuevo.',
    user_banned: 'Esta cuenta está bloqueada. Contacta con el administrador del club.',
    email_provider_disabled: 'El acceso por correo y contraseña no está habilitado en este proyecto de Supabase.',
    bad_jwt: 'La sesión no es válida. Vuelve a entrar con tu correo y contraseña.',
    refresh_token_not_found: 'La sesión ha caducado. Vuelve a entrar con tu correo y contraseña.',
    refresh_token_already_used: 'La sesión ha caducado. Vuelve a entrar con tu correo y contraseña.',
  };
  if (typeof receivedCode === 'string' && Object.hasOwn(messages, receivedCode)) {
    return { message: messages[receivedCode], code: receivedCode, status };
  }
  if (status === 429 || receivedCode === 'over_request_rate_limit' || receivedCode === 'over_email_send_rate_limit') {
    return { message: 'Hay demasiados intentos de acceso. Espera unos minutos antes de volver a probar.', code: 'rate_limit', status };
  }
  if (status !== null && status >= 500) {
    return { message: 'Supabase ha respondido con un error del servidor. Inténtalo de nuevo más tarde.', code: 'server_error', status };
  }
  if (details.name === 'AbortError') {
    return { message: 'La solicitud ha tardado demasiado. Comprueba la conexión y vuelve a probar.', code: 'timeout', status };
  }
  if (details.name === 'TypeError' || details.name === 'AuthRetryableFetchError' || details.status === 0) {
    return { message: 'El navegador no ha podido conectar con Supabase. Comprueba la conexión del móvil y vuelve a probar.', code: 'network_error', status };
  }
  if (status === 401 || status === 403) {
    return { message: 'Supabase ha rechazado la conexión del proyecto. Necesitamos revisar su configuración de acceso.', code: 'project_access', status };
  }
  return { message: 'No se pudo completar el inicio de sesión. Comparte el código que aparece debajo para poder revisarlo.', code: 'auth_error', status };
}
