import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../data/supabase';
import { demoRepository, remoteRepository } from '../data/repository';
import type { ClubRepository, Team } from '../data/repository';
import TeamScreen from './TeamScreen';
import { describeAuthFailure } from '../authError';
import { hasRecoveryIntent, PASSWORD_RECOVERY_REDIRECT } from '../passwordRecovery';
import PasswordResetScreen from './PasswordResetScreen';
import { ExercisesLibrary } from '../components/ExercisesLibrary';
import { UsersPanel } from '../components/UsersPanel';

export default function EntryScreen() {
  const [initialRecoveryState] = useState(() => {
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    return {
      requested: web && hasRecoveryIntent(window.location.search, window.location.hash),
      failed: web && new URLSearchParams(window.location.search).get('password_reset_error') === '1',
    };
  });
  const [recovering, setRecovering] = useState(initialRecoveryState.requested);
  const [recoveryInvalid, setRecoveryInvalid] = useState(initialRecoveryState.failed);
  const [requestReset, setRequestReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(!supabase);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const repository = useMemo(() => supabase ? remoteRepository(supabase) : null, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (active) { setSession(next); if (next) setDemo(false); if (event === 'PASSWORD_RECOVERY') { setRecovering(true); router.setParams({ '#': undefined, password_reset: '1' }); } }
    });
    Promise.all([supabase.auth.initialize(), supabase.auth.getSession()]).then(([initialization, { data, error }]) => {
      if (active) {
        const failed = initialRecoveryState.failed || !!initialization.error;
        setRecoveryInvalid(failed); setSession(data.session); setReady(true);
        if (initialRecoveryState.requested) router.setParams({ '#': undefined, password_reset_error: failed ? '1' : undefined });
        if (error) setError('No se pudo recuperar la sesión. Vuelve a entrar.');
      }
    }).catch(() => { if (active) { setReady(true); setError('No se pudo recuperar la sesión.'); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [initialRecoveryState]);
  async function signIn() {
    if (!supabase || busy) return;
    if (!email.trim() || !password) { setError('Escribe tu correo y contraseña.'); setDiagnostic(''); return; }
    setBusy(true); setError(''); setDiagnostic('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword(''); setSession(result.data.session);
    } catch (cause) {
      const failure = describeAuthFailure(cause);
      setError(failure.message);
      setDiagnostic(`Código: ${failure.code}${failure.status ? ` · HTTP ${failure.status}` : ''}`);
      setPassword('');
    }
    finally { setBusy(false); }
  }
  function finishRecovery(requestAnother = false) {
    setRecovering(false); setRecoveryInvalid(false); setRequestReset(requestAnother); setResetSent(false);
    setError(''); setDiagnostic(''); setNotice('');
    router.setParams({ password_reset: undefined, password_reset_error: undefined, '#': undefined });
  }
  async function sendResetEmail() {
    if (!supabase || busy || resetSent) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Escribe un correo electrónico válido.'); return;
    }
    setBusy(true); setError(''); setDiagnostic(''); setNotice('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: PASSWORD_RECOVERY_REDIRECT });
      if (error) throw error;
      setResetSent(true);
      setNotice('Si existe una cuenta con ese correo, recibirás un enlace para elegir una contraseña nueva. Revisa también la carpeta de spam.');
    } catch (cause) {
      const failure = describeAuthFailure(cause); setError(failure.message);
      setDiagnostic(`Código: ${failure.code}${failure.status ? ` · HTTP ${failure.status}` : ''}`);
    } finally { setBusy(false); }
  }
  async function leave() {
    if (demo) { setDemo(false); return; }
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    setSession(null);
  }
  if (!ready) return <SafeAreaView style={s.safe}><ActivityIndicator accessibilityLabel="Recuperando sesión" /></SafeAreaView>;
  if (recovering && supabase) return <PasswordResetScreen client={supabase} hasSession={!!session} validLink={!recoveryInvalid} onComplete={() => finishRecovery()} onCancel={() => finishRecovery()} onRequestNew={() => finishRecovery(true)} />;
  if (demo || (session && repository)) return <TeamHub key={demo ? 'demo' : session!.user.id} repository={demo ? demoRepository : repository!} onLeave={leave} />;
  return <SafeAreaView style={s.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={s.card}>
      <Image source={require('../../assets/club-crest.jpg')} style={s.crest} resizeMode="contain" accessibilityLabel="Escudo del Inter Playa Honda" />
      <Text style={s.kicker}>INTER PLAYA HONDA</Text><Text style={s.title}>{requestReset ? 'Recuperar contraseña' : 'Tu equipo empieza aquí.'}</Text><Text style={s.text}>{requestReset ? 'Te enviaremos un enlace para elegir una contraseña nueva.' : 'Acceso para entrenadores del club.'}</Text>
      {!supabase && <Text style={s.notice}>La conexión del club está pendiente. Puedes probar la demo con jugadores ficticios.</Text>}
      <Text style={s.label}>Correo electrónico</Text><TextInput accessibilityLabel="Correo electrónico" style={s.input} value={email} onChangeText={value => { setEmail(value); setResetSent(false); setNotice(''); }} autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!!supabase && !busy} />
      {!requestReset && <><Text style={s.label}>Contraseña</Text><TextInput accessibilityLabel="Contraseña" style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" editable={!!supabase && !busy} onSubmitEditing={() => void signIn()} /></>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!!diagnostic && <Text selectable style={s.diagnostic}>{diagnostic}</Text>}
      {!!notice && <Text accessibilityRole="status" style={s.notice}>{notice}</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !supabase || busy || (requestReset && resetSent) }} disabled={!supabase || busy || (requestReset && resetSent)} style={[s.button, (!supabase || busy || (requestReset && resetSent)) && s.disabled]} onPress={() => { if (requestReset) void sendResetEmail(); else void signIn(); }}><Text style={s.white}>{busy ? (requestReset ? 'Solicitando enlace…' : 'Entrando…') : requestReset ? (resetSent ? 'Solicitud enviada' : 'Enviar enlace de recuperación') : 'Entrar con mi cuenta'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => { setRequestReset(value => !value); setPassword(''); setError(''); setDiagnostic(''); setNotice(''); setResetSent(false); }}><Text style={s.link}>{requestReset ? 'Volver a iniciar sesión' : 'He olvidado mi contraseña'}</Text></Pressable>
      <Text style={s.text}>Las cuentas las gestiona el club. Para un alta, contacta con el administrador.</Text>
      <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => { setPassword(''); setError(''); setDiagnostic(''); setNotice(''); setDemo(true); }}><Text style={s.link}>Probar con datos ficticios</Text></Pressable>
      <Text style={s.version}>Acceso · versión 3</Text>
    </View>
  </ScrollView></SafeAreaView>;
}
function TeamHub({ repository, onLeave }: { repository: ClubRepository; onLeave: () => Promise<void> }) {
  const { team: teamParam, view } = useLocalSearchParams<{ team?: string; view?: string }>();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [includeArchivedTeams, setIncludeArchivedTeams] = useState(false);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [adminError, setAdminError] = useState(false);
  const [adminAttempt, setAdminAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    repository.teams().then(data => { if (active) { setTeams(data); setError(''); } }).catch(() => { if (active) setError('No se pudieron cargar los equipos.'); });
    return () => { active = false; };
  }, [repository, attempt]);
  useEffect(() => {
    let active = true;
    repository.users.isAdmin().then(value => { if (active) { setAdmin(value); setAdminError(false); } })
      .catch(() => { if (active) { setAdmin(false); setAdminError(true); } });
    return () => { active = false; };
  }, [repository, adminAttempt]);
  const activeTeams = teams?.filter(item => !item.archivedAt);
  const team = teams?.find(item => item.id === teamParam) ?? (activeTeams?.length === 1 ? activeTeams[0] : null);
  if (view === 'users') return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.libraryContent}>
    <Text style={s.title}>Inter Playa Honda</Text>
    <Pressable accessibilityRole="button" disabled={libraryBusy} style={s.secondary} onPress={() => router.setParams({ view: 'attendance' })}><Text style={s.link}>Volver al equipo</Text></Pressable>
    {admin === null ? <ActivityIndicator accessibilityLabel="Comprobando acceso de administración" /> : adminError ? <><Text accessibilityRole="alert" style={s.error}>No se pudo comprobar tu acceso de administrador.</Text><Pressable accessibilityRole="button" style={s.secondary} onPress={() => { setAdmin(null); setAdminError(false); setAdminAttempt(value => value + 1); }}><Text style={s.link}>Reintentar acceso de administrador</Text></Pressable></> : admin ? <UsersPanel repository={repository.users} onBusyChange={setLibraryBusy} onTeamsChanged={created => setTeams(current => [...(current ?? []).filter(item => item.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name, 'es')))} onTeamDeleted={id => { setTeams(current => current?.filter(item => item.id !== id) ?? null); if (teamParam === id) router.setParams({ team: undefined }); }} onOpenTeam={item => { setTeams(current => [...(current ?? []).filter(value => value.id !== item.id), item]); router.setParams({ team: item.id, view: 'attendance', training_id: undefined, match_id: undefined, create_training: undefined, create_match: undefined }); }} /> : <Text style={s.text}>Este apartado está disponible solo para los administradores del club.</Text>}
  </ScrollView></SafeAreaView>;
  if (team && teams) return <TeamScreen key={`${team.id}:${team.archivedAt ?? ''}`} team={team} teams={teams} repository={repository} onLeave={onLeave} isAdmin={admin === true} />;
  if (view === 'exercises') return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.libraryContent}>
    <Text style={s.title}>Inter Playa Honda</Text>
    <Pressable accessibilityRole="button" disabled={libraryBusy} style={s.secondary} onPress={() => router.setParams({ view: undefined })}><Text style={s.link}>Volver a mis equipos</Text></Pressable>
    <ExercisesLibrary repository={repository.exercises} onBusyChange={setLibraryBusy} />
  </ScrollView></SafeAreaView>;
  return <SafeAreaView style={s.safe}><View style={s.content}><Text style={s.title}>Mis equipos</Text>
    {!teams && !error && <ActivityIndicator accessibilityLabel="Cargando equipos" />}
    {!!error && <><Text style={s.error}>{error}</Text><Pressable accessibilityRole="button" style={s.secondary} onPress={() => setAttempt(value => value + 1)}><Text>Reintentar</Text></Pressable></>}
    {activeTeams?.length === 0 && <Text style={s.text}>{teams?.length ? 'No tienes equipos activos. Activa «Mostrar equipos archivados» para consultar su historial.' : 'No tienes equipos asignados. Pide al administrador del club que revise tu acceso.'}</Text>}
    {!!teams?.some(item => item.archivedAt) && <Pressable accessibilityRole="checkbox" accessibilityLabel="Mostrar equipos archivados" aria-checked={includeArchivedTeams} style={s.secondary} onPress={() => setIncludeArchivedTeams(value => !value)}><Text style={s.link}>{includeArchivedTeams ? '☑' : '☐'} Mostrar equipos archivados</Text></Pressable>}
    {teams?.filter(item => includeArchivedTeams || !item.archivedAt).map(item => <Pressable accessibilityRole="button" key={item.id} style={s.secondary} onPress={() => router.setParams({ team: item.id })}><Text style={s.link}>{item.name}{item.archivedAt ? ' · Archivado (consulta)' : ''}</Text></Pressable>)}
    {teams && <Pressable accessibilityRole="button" style={s.secondary} onPress={() => router.setParams({ view: 'exercises' })}><Text style={s.link}>Biblioteca compartida de ejercicios</Text></Pressable>}
    {admin && <Pressable accessibilityRole="button" style={s.secondary} onPress={() => router.setParams({ view: 'users' })}><Text style={s.link}>Usuarios del club</Text></Pressable>}
    <Pressable accessibilityRole="button" style={s.secondary} onPress={() => { void onLeave().catch(() => setError('No se pudo cerrar la sesión.')); }}><Text>Salir</Text></Pressable>
  </View></SafeAreaView>;
}
const s = StyleSheet.create({ libraryContent: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, gap: 20 }, diagnostic: { fontSize: 12, color: '#5D6D7E' }, version: { fontSize: 11, textAlign: 'center', color: '#718096', marginTop: 8 }, safe: { flex: 1, backgroundColor: '#F4F6F9' }, content: { flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24 }, card: { backgroundColor: '#FFF', borderRadius: 18, padding: 24, borderWidth: 1, borderColor: '#DFE5EC', gap: 12 }, crest: { width: 88, height: 88, alignSelf: 'center' }, kicker: { color: '#176BA0', fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textAlign: 'center' }, title: { color: '#17212D', fontSize: 26, fontWeight: '800', marginBottom: 4 }, text: { color: '#5D6D7E', fontSize: 13, lineHeight: 21 }, label: { fontSize: 13, color: '#17212D', fontWeight: '600' }, input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, color: '#17212D' }, button: { minHeight: 48, backgroundColor: '#176BA0', borderRadius: 8, justifyContent: 'center', alignItems: 'center', padding: 10 }, white: { color: '#FFF', fontWeight: '700' }, secondary: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, marginTop: 8 }, link: { color: '#176BA0', fontWeight: '600' }, error: { color: '#A52D38', fontSize: 13, lineHeight: 20 }, notice: { backgroundColor: '#E5EFF8', padding: 12, color: '#24445F', lineHeight: 20, fontSize: 13 }, disabled: { opacity: 0.5 } });
