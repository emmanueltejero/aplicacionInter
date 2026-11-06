import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../data/supabase';
import { demoRepository, remoteRepository } from '../data/repository';
import type { ClubRepository, Team } from '../data/repository';
import TeamScreen from './TeamScreen';

export default function EntryScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(!supabase);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const repository = useMemo(() => supabase ? remoteRepository(supabase) : null, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setReady(true); if (next) setDemo(false); }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) { setSession(data.session); setReady(true); if (error) setError('No se pudo recuperar la sesión. Vuelve a entrar.'); }
    }).catch(() => { if (active) { setReady(true); setError('No se pudo recuperar la sesión.'); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  async function signIn() {
    if (!supabase || busy) return;
    if (!email.trim() || !password) { setError('Escribe tu correo y contraseña.'); return; }
    setBusy(true); setError('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword(''); setSession(result.data.session);
    } catch { setError('No se pudo iniciar sesión. Revisa tus datos y la conexión; el club debe haber dado de alta tu cuenta.'); }
    finally { setBusy(false); }
  }
  async function leave() {
    if (demo) { setDemo(false); return; }
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    setSession(null);
  }
  if (!ready) return <SafeAreaView style={s.safe}><ActivityIndicator accessibilityLabel="Recuperando sesión" /></SafeAreaView>;
  if (demo || (session && repository)) return <TeamHub key={demo ? 'demo' : session!.user.id} repository={demo ? demoRepository : repository!} onLeave={leave} />;
  return <SafeAreaView style={s.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={s.card}>
      <Image source={require('../../assets/club-crest.jpg')} style={s.crest} resizeMode="contain" accessibilityLabel="Escudo del Inter Playa Honda" />
      <Text style={s.kicker}>INTER PLAYA HONDA</Text><Text style={s.title}>Tu equipo empieza aquí.</Text><Text style={s.text}>Acceso para entrenadores del club.</Text>
      {!supabase && <Text style={s.notice}>La conexión del club está pendiente. Puedes probar la demo con jugadores ficticios.</Text>}
      <Text style={s.label}>Correo electrónico</Text><TextInput accessibilityLabel="Correo electrónico" style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!!supabase && !busy} />
      <Text style={s.label}>Contraseña</Text><TextInput accessibilityLabel="Contraseña" style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" editable={!!supabase && !busy} onSubmitEditing={() => void signIn()} />
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !supabase || busy }} disabled={!supabase || busy} style={[s.button, (!supabase || busy) && s.disabled]} onPress={() => void signIn()}><Text style={s.white}>{busy ? 'Entrando…' : 'Entrar con mi cuenta'}</Text></Pressable>
      <Text style={s.text}>Las cuentas las gestiona el club. Para un alta o recuperar el acceso, contacta con el administrador.</Text>
      <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => { setPassword(''); setError(''); setDemo(true); }}><Text style={s.link}>Probar con datos ficticios</Text></Pressable>
    </View>
  </ScrollView></SafeAreaView>;
}
function TeamHub({ repository, onLeave }: { repository: ClubRepository; onLeave: () => Promise<void> }) {
  const { team: teamParam } = useLocalSearchParams<{ team?: string }>();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    repository.teams().then(data => { if (active) { setTeams(data); setError(''); } }).catch(() => { if (active) setError('No se pudieron cargar los equipos.'); });
    return () => { active = false; };
  }, [repository, attempt]);
  const team = teams?.find(item => item.id === teamParam) ?? (teams?.length === 1 ? teams[0] : null);
  if (team && teams) return <TeamScreen key={team.id} team={team} teams={teams} repository={repository} onLeave={onLeave} />;
  return <SafeAreaView style={s.safe}><View style={s.content}><Text style={s.title}>Mis equipos</Text>
    {!teams && !error && <ActivityIndicator accessibilityLabel="Cargando equipos" />}
    {!!error && <><Text style={s.error}>{error}</Text><Pressable accessibilityRole="button" style={s.secondary} onPress={() => setAttempt(value => value + 1)}><Text>Reintentar</Text></Pressable></>}
    {teams?.length === 0 && <Text style={s.text}>No tienes equipos asignados. Pide al administrador del club que revise tu acceso.</Text>}
    {teams?.map(item => <Pressable accessibilityRole="button" key={item.id} style={s.secondary} onPress={() => router.setParams({ team: item.id })}><Text style={s.link}>{item.name}</Text></Pressable>)}
    <Pressable accessibilityRole="button" style={s.secondary} onPress={() => { void onLeave().catch(() => setError('No se pudo cerrar la sesión.')); }}><Text>Salir</Text></Pressable>
  </View></SafeAreaView>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#F4F6F9' }, content: { flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24 }, card: { backgroundColor: '#FFF', borderRadius: 18, padding: 24, borderWidth: 1, borderColor: '#DFE5EC', gap: 12 }, crest: { width: 88, height: 88, alignSelf: 'center' }, kicker: { color: '#176BA0', fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textAlign: 'center' }, title: { color: '#17212D', fontSize: 26, fontWeight: '800', marginBottom: 4 }, text: { color: '#5D6D7E', fontSize: 13, lineHeight: 21 }, label: { fontSize: 13, color: '#17212D', fontWeight: '600' }, input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, color: '#17212D' }, button: { minHeight: 48, backgroundColor: '#176BA0', borderRadius: 8, justifyContent: 'center', alignItems: 'center', padding: 10 }, white: { color: '#FFF', fontWeight: '700' }, secondary: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, marginTop: 8 }, link: { color: '#176BA0', fontWeight: '600' }, error: { color: '#A52D38', fontSize: 13, lineHeight: 20 }, notice: { backgroundColor: '#E5EFF8', padding: 12, color: '#24445F', lineHeight: 20, fontSize: 13 }, disabled: { opacity: 0.5 } });
