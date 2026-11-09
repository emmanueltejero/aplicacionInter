import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describeAuthFailure } from '../authError';
import { validateNewPassword } from '../passwordRecovery';

export default function PasswordResetScreen({ client, hasSession, validLink, onComplete, onCancel, onRequestNew }: {
  client: SupabaseClient; hasSession: boolean; validLink: boolean;
  onComplete: () => void; onCancel: () => void; onRequestNew: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (busy || !hasSession || !validLink) return;
    try { validateNewPassword(password, confirmation); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Revisa la nueva contraseña.'); return; }
    setBusy(true); setError('');
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      setPassword(''); setConfirmation(''); onComplete();
    } catch (cause) {
      const failure = describeAuthFailure(cause);
      setError(`${failure.message} Código: ${failure.code}`);
    } finally { setBusy(false); }
  }
  async function cancel(requestAnother = false) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (hasSession) {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
      }
      setPassword(''); setConfirmation(''); if (requestAnother) onRequestNew(); else onCancel();
    } catch { setError('No se pudo cerrar la sesión de recuperación. Vuelve a intentarlo.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={s.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={s.card}>
    <Image source={require('../../assets/club-crest.jpg')} style={s.crest} resizeMode="contain" accessibilityLabel="Escudo del Inter Playa Honda" />
    <Text style={s.title}>Elige tu nueva contraseña</Text>
    {hasSession && validLink ? <>
      <Text style={s.text}>El enlace ha verificado tu acceso. Escribe una contraseña de al menos 8 caracteres para volver a tu equipo.</Text>
      <Text style={s.label}>Nueva contraseña</Text><TextInput accessibilityLabel="Nueva contraseña" style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" editable={!busy} />
      <Text style={s.label}>Repetir nueva contraseña</Text><TextInput accessibilityLabel="Repetir nueva contraseña" style={s.input} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" editable={!busy} onSubmitEditing={() => void save()} />
      <Pressable accessibilityRole="button" disabled={busy} style={s.primary} onPress={() => void save()}><Text style={s.white}>{busy ? 'Guardando…' : 'Guardar contraseña y entrar'}</Text></Pressable>
    </> : <>
      <Text style={s.text}>No se pudo validar este enlace. Puede haber caducado o haberse utilizado. Abre el enlace del correo más reciente o solicita uno nuevo.</Text>
      <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => void cancel(true)}><Text style={s.white}>Solicitar otro enlace</Text></Pressable>
    </>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => void cancel()}><Text style={s.link}>Volver al acceso</Text></Pressable>
  </View></ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#F4F6F9' }, content: { flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24 }, card: { backgroundColor: '#FFF', borderRadius: 18, padding: 24, borderWidth: 1, borderColor: '#DFE5EC', gap: 12 }, crest: { width: 88, height: 88, alignSelf: 'center' }, title: { color: '#17212D', fontSize: 25, fontWeight: '800' }, text: { color: '#5D6D7E', fontSize: 13, lineHeight: 21 }, label: { fontSize: 13, color: '#17212D', fontWeight: '600' }, input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, color: '#17212D' }, primary: { minHeight: 48, backgroundColor: '#176BA0', borderRadius: 8, justifyContent: 'center', alignItems: 'center', padding: 10 }, white: { color: '#FFF', fontWeight: '700' }, secondary: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8 }, link: { color: '#176BA0', fontWeight: '600' }, error: { color: '#A52D38', fontSize: 13, lineHeight: 20 } });
