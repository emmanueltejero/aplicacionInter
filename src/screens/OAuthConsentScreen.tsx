import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useLocalSearchParams } from 'expo-router';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { supabase } from '../data/supabase';
import { chatGptCallback, validAuthorizationId } from '../oauthConsent';
import { trainingStyles as s } from '../components/trainingStyles';

function redirect(value: string) {
  const url = chatGptCallback(value);
  if (Platform.OS === 'web') window.location.assign(url);
  else void Linking.openURL(url);
}
export default function OAuthConsentScreen() {
  const { authorization_id } = useLocalSearchParams<{ authorization_id?: string }>();
  const [loading, setLoading] = useState(true), [signedIn, setSignedIn] = useState(false), [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null), [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const validId = validAuthorizationId(authorization_id);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(''); setDetails(null); setAllowed(false);
      if (!supabase || !validId) { setError('Falta una solicitud válida de autorización. Inicia la conexión desde ChatGPT.'); setLoading(false); return; }
      try {
        const { data: { user }, error: sessionError } = await supabase.auth.getUser();
        if (!active) return;
        setSignedIn(!!user && !sessionError);
        if (!user || sessionError) return;
        const { data, error: authError } = await supabase.auth.oauth.getAuthorizationDetails(authorization_id!);
        if (authError || !data) throw new Error();
        if ('redirect_url' in data) { if (active) redirect(data.redirect_url); return; }
        chatGptCallback(data.redirect_uri);
        const permission = await supabase.rpc('club_mcp_client_allowed', { p_client: data.client.id });
        if (active) { setDetails(data); setAllowed(!permission.error && permission.data === true); }
      } catch { if (active) setError('No se pudo comprobar esta autorización. Reintenta la conexión desde ChatGPT o consulta al administrador.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [authorization_id, validId, attempt]);
  async function signIn() {
    if (!supabase || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw new Error();
      setPassword(''); setAttempt(value => value + 1);
    } catch { setError('No se pudo iniciar sesión. Revisa tus datos y la conexión.'); setPassword(''); }
    finally { lock.current = false; setBusy(false); }
  }
  async function decide(approve: boolean) {
    if (!supabase || !details || lock.current || (approve && !allowed)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = approve
        ? await supabase.auth.oauth.approveAuthorization(details.authorization_id, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(details.authorization_id, { skipBrowserRedirect: true });
      if (result.error || !result.data?.redirect_url) throw new Error();
      redirect(result.data.redirect_url);
    } catch { setError('No se pudo completar la autorización. Vuelve a iniciar la conexión desde ChatGPT.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F7FA' }}><ScrollView contentContainerStyle={{ padding: 18, gap: 16, width: '100%', maxWidth: 600, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Conectar Inter Playa Honda con ChatGPT</Text>
    <Text style={s.text}>Autoriza consultas de los equipos a los que tienes acceso. Esta conexión no permite crear, modificar ni borrar datos.</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Comprobando autorización" /> : !signedIn && validId ? <View style={s.card}>
      <Text style={s.subtitle}>Entra con tu cuenta del club</Text>
      <TextInput accessibilityLabel="Correo del club para autorizar ChatGPT" autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={s.input} value={email} onChangeText={setEmail} editable={!busy} placeholder="Correo electrónico" />
      <TextInput accessibilityLabel="Contraseña del club para autorizar ChatGPT" secureTextEntry autoComplete="current-password" style={s.input} value={password} onChangeText={setPassword} editable={!busy} placeholder="Contraseña" />
      <Pressable accessibilityRole="button" disabled={busy || !email.trim() || !password} style={s.primary} onPress={() => { void signIn(); }}><Text style={s.white}>{busy ? 'Entrando…' : 'Entrar para autorizar'}</Text></Pressable>
    </View> : details && <View style={s.card}>
      <Text style={s.subtitle}>{details.client.name}</Text><Text style={s.text}>Cuenta: {details.user.email}</Text>
      <Text style={s.text}>ChatGPT podrá consultar plantillas, asistencia, partidos y minutos. Los resultados pueden incluir nombres de jugadores. Solo se compartirán al solicitar estas consultas.</Text>
      <Text style={s.small}>Permisos OAuth: {details.scope || 'Identificación de la cuenta'}</Text>
      {!allowed && <Text accessibilityRole="alert" style={s.error}>El administrador debe habilitar este cliente OAuth y tu cuenta antes de autorizarlo. Identificador del cliente: {details.client.id}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || !allowed} style={[s.primary, !allowed && { opacity: .5 }]} onPress={() => { void decide(true); }}><Text style={s.white}>Autorizar consultas en ChatGPT</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => { void decide(false); }}><Text style={s.blue}>Denegar acceso</Text></Pressable>
    </View>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!loading && signedIn && <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => setAttempt(value => value + 1)}><Text style={s.blue}>Reintentar autorización</Text></Pressable>}
    <Link href="/" style={s.blue}>Volver a la aplicación del club</Link>
  </ScrollView></SafeAreaView>;
}
