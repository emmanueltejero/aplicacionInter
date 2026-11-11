import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { ClubUser, CoachAccessUpdate, CoachAccountDraft } from '../clubUsers';
import { UsersSetupRequired } from '../clubUsers';
import type { UsersRepository } from '../data/usersRepository';
import { newRecordId } from '../recordId';
import { normalizeExerciseSearch } from '../exercises';
import { CoachAccountForm } from './CoachAccountForm';
import { CoachAccessEditor } from './CoachAccessEditor';
import { trainingStyles as s } from './trainingStyles';
import { TeamCategoriesSetupRequired } from '../teams';
import type { Team } from '../teams';
import { TeamCategoryPicker, TeamCategoriesSetup } from './TeamCategoryPicker';
import { TeamCategoryEditor } from './TeamCategoryEditor';
import { ExerciseReviewerEditor } from './ExerciseReviewerEditor';
import { ExerciseReviewsSetup } from './ExerciseReviews';
import { TeamManagementDialog, TeamManagementSetup } from './TeamManagementDialog';
import type { TeamAction } from './TeamManagementDialog';

const guideUrl = 'https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/WEB-USERS.md';
type Directory = Awaited<ReturnType<UsersRepository['load']>>;
export function UsersPanel({ repository, onBusyChange, onTeamsChanged, onTeamDeleted, onOpenTeam }: {
  repository: UsersRepository; onBusyChange: (busy: boolean) => void; onTeamsChanged: (team: Team) => void; onTeamDeleted: (id: string) => void; onOpenTeam: (team: Team) => void;
}) {
  const [data, setData] = useState<Directory | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [form, setForm] = useState(false);
  const [teamEditor, setTeamEditor] = useState<Team | null>(null);
  const [teamError, setTeamError] = useState('');
  const [teamSetupNeeded, setTeamSetupNeeded] = useState(false);
  const [showTeamCategories, setShowTeamCategories] = useState(false);
  const [categoryEditor, setCategoryEditor] = useState<Team | null>(null);
  const [accessEditor, setAccessEditor] = useState<ClubUser | null>(null);
  const [reviewerEditor, setReviewerEditor] = useState<ClubUser | null>(null);
  const [includeArchivedTeams, setIncludeArchivedTeams] = useState(false);
  const [teamAction, setTeamAction] = useState<{ team: Team; action: TeamAction } | null>(null);
  useEffect(() => {
    let active = true;
    repository.load().then(result => { if (active) { setData(result); setLoadError(null); } })
      .catch(cause => { if (active) setLoadError(cause instanceof Error ? cause : new Error('No se pudieron cargar los usuarios.')); });
    return () => { active = false; };
  }, [repository, attempt]);
  function openGuide() { void Linking.openURL(guideUrl).catch(() => setError('No se pudo abrir GitHub. Busca supabase/WEB-USERS.md en el repositorio.')); }
  function refresh() { setData(null); setLoadError(null); setError(''); setAttempt(value => value + 1); }
  async function create(request: CoachAccountDraft) {
    if (locked.current) throw new Error('Espera a que termine la operación.');
    locked.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const result = await repository.create(request);
      setForm(false);
      setNotice(result.replayed ? 'El alta de este intento ya estaba completada. Se conservan la contraseña y los permisos existentes.' : `Cuenta creada: ${result.email}. Ya puede entrar con las credenciales que has indicado.`);
      try { setData(await repository.load()); } catch { setError('El alta está completada, pero no se pudo actualizar la lista. Pulsa Actualizar usuarios.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear la cuenta.'); throw cause; }
    finally { locked.current = false; setBusy(false); onBusyChange(false); }
  }
  async function createTeam() {
    if (locked.current || !teamEditor) return;
    const name = teamEditor.name.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 80) { setTeamError('Escribe un nombre de entre 1 y 80 caracteres.'); return; }
    locked.current = true; setBusy(true); onBusyChange(true); setTeamError('');
    try {
      const team = await repository.createTeam(teamEditor.id, name, data?.teamCategoriesReady ? teamEditor.category ?? null : undefined);
      setData(current => current ? { ...current, teams: [...current.teams.filter(item => item.id !== team.id), team].sort((a, b) => a.name.localeCompare(b.name, 'es')) } : current);
      onTeamsChanged(team); setTeamEditor(null); setNotice(`Equipo creado: ${team.name}. Ya puedes asignarlo a un entrenador.`);
    } catch (cause) { setTeamError(cause instanceof Error ? cause.message : 'No se pudo crear el equipo.'); setTeamSetupNeeded(cause instanceof TeamCategoriesSetupRequired); }
    finally { locked.current = false; setBusy(false); onBusyChange(false); }
  }
  async function saveTeamCategory(category: Team['category']) {
    if (locked.current || !categoryEditor) throw new Error('Espera a que termine la operación.');
    locked.current = true; setBusy(true); onBusyChange(true); setNotice('');
    try {
      const team = await repository.setTeamCategory(categoryEditor, category ?? null);
      setData(current => current ? { ...current, teams: current.teams.map(item => item.id === team.id ? team : item) } : current);
      onTeamsChanged(team); setCategoryEditor(null); setNotice(`Categoría de ${team.name}: ${team.category ?? 'Sin categoría'}.`);
    } finally { locked.current = false; setBusy(false); onBusyChange(false); }
  }
  async function manageTeam(name: string) {
    if (locked.current || !teamAction) throw new Error('Espera a que termine la operación.');
    locked.current = true; setBusy(true); onBusyChange(true); setNotice('');
    const { team, action } = teamAction;
    try {
      if (action === 'delete') {
        await repository.deleteEmptyTeam(team);
        setData(current => current ? { ...current, teams: current.teams.filter(item => item.id !== team.id), users: current.users.map(user => ({ ...user, teamIds: user.teamIds.filter(id => id !== team.id) })) } : current);
        onTeamDeleted(team.id); setNotice(`Equipo eliminado: ${team.name}. Las cuentas de los entrenadores se conservan.`);
      } else {
        const saved = action === 'rename' ? await repository.renameTeam(team, name) : await repository.archiveTeam(team, action === 'archive');
        setData(current => current ? { ...current, teams: current.teams.map(item => item.id === saved.id ? saved : item).sort((a,b) => a.name.localeCompare(b.name,'es')) } : current);
        onTeamsChanged(saved); if (saved.archivedAt) setIncludeArchivedTeams(true);
        setNotice(action === 'rename' ? `Nombre actualizado: ${saved.name}.` : action === 'archive' ? `Equipo archivado: ${saved.name}. Su historial se conserva.` : `Equipo restaurado: ${saved.name}.`);
      }
      setTeamAction(null);
    } finally { locked.current = false; setBusy(false); onBusyChange(false); }
  }
  async function saveReviewer(allowed: boolean) {
    if (locked.current || !reviewerEditor) throw new Error('Espera a que termine la operación.');
    locked.current = true; setBusy(true); onBusyChange(true); setNotice('');
    try {
      await repository.setExerciseReviewer(reviewerEditor, allowed);
      setData(current => current ? { ...current, users: current.users.map(user => user.id === reviewerEditor.id ? { ...user, canReviewExercises: allowed } : user) } : current);
      setReviewerEditor(null); setNotice(allowed ? 'Permiso de revisión metodológica concedido.' : 'Permiso de revisión metodológica retirado.');
    } finally { locked.current = false; setBusy(false); onBusyChange(false); }
  }
  async function saveAccess(request: CoachAccessUpdate) {
    if (locked.current) throw new Error('Espera a que termine la operación.');
    locked.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const result = await repository.updateAccess(request);
      setData(current => current ? { ...current, users: current.users.map(user => user.id === result.id ? { ...user, enabled: result.enabled, teamIds: result.teamIds } : user) } : current);
      setAccessEditor(null);
      setNotice(result.enabled ? 'Acceso y equipos del entrenador actualizados.' : 'Acceso del entrenador desactivado. Su cuenta y el historial se conservan.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el acceso.'); throw cause; }
    finally { locked.current = false; setBusy(false); onBusyChange(false); }
  }
  if (loadError) return <View style={s.container}>
    <Text style={s.title}>Usuarios del club</Text><Text accessibilityRole="alert" style={s.error}>{loadError.message}</Text>
    {loadError instanceof UsersSetupRequired && <Text style={s.text}>Este apartado requiere activar el SQL de usuarios y desplegar la función club-users en Supabase una vez. La guía explica ambos pasos.</Text>}
    <Pressable accessibilityRole="button" style={s.secondary} onPress={openGuide}><Text style={s.blue}>Abrir guía de activación de Usuarios</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.primary} onPress={refresh}><Text style={s.white}>Reintentar usuarios</Text></Pressable>{!!error && <Text style={s.error}>{error}</Text>}
  </View>;
  if (!data) return <ActivityIndicator accessibilityLabel="Cargando usuarios del club" color="#176BA0" />;
  const text = normalizeExerciseSearch(query).trim();
  const users = data.users.filter(user => normalizeExerciseSearch(`${user.name} ${user.email} ${user.teamIds.map(id => data.teams.find(team => team.id === id)?.name ?? '').join(' ')}`).includes(text));
  const activeTeams = data.teams.filter(team => !team.archivedAt);
  return <View style={s.container}>
    <Text style={s.title}>Usuarios del club</Text><Text style={s.text}>Da de alta entrenadores, cambia sus equipos y activa o desactiva su acceso. Este apartado está reservado a administradores.</Text>
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy || !activeTeams.length} onPress={() => { setError(''); setNotice(''); setForm(true); }}><Text style={s.white}>Añadir entrenador</Text></Pressable>
    {!activeTeams.length && <Text style={s.text}>Crea o restaura un equipo para poder asignarlo al entrenador.</Text>}
    <View style={s.controls}><Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={() => { setTeamError(''); setTeamSetupNeeded(false); setTeamEditor({ id: newRecordId(), name: '', category: null }); }}><Text style={s.blue}>Crear equipo</Text></Pressable><Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={refresh}><Text style={s.blue}>Actualizar usuarios</Text></Pressable></View>
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.blue}>{notice}</Text>}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!data.exerciseReviewersReady && <ExerciseReviewsSetup />}
    <Pressable accessibilityRole="button" accessibilityLabel="Gestionar equipos" aria-expanded={showTeamCategories} disabled={busy} style={s.secondary} onPress={() => setShowTeamCategories(value => !value)}><Text style={s.blue}>Gestionar equipos {showTeamCategories ? '▴' : '▾'}</Text></Pressable>
    {showTeamCategories && <View style={s.container}>
      <Text style={s.text}>Cambia nombres y categorías, archiva equipos conservando su historial o elimina los que estén vacíos.</Text>
      {!data.teamCategoriesReady && <TeamCategoriesSetup />}
      {!data.teamManagementReady && <TeamManagementSetup />}
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Incluir equipos archivados" aria-checked={includeArchivedTeams} style={s.secondary} disabled={busy} onPress={() => setIncludeArchivedTeams(value => !value)}><Text style={s.blue}>{includeArchivedTeams ? '☑' : '☐'} Incluir equipos archivados</Text></Pressable>
      {!data.teams.length && <Text style={s.text}>Crea un equipo para asignarle su categoría.</Text>}
      {data.teams.filter(team => includeArchivedTeams || !team.archivedAt).map(team => <View key={team.id} style={s.card} accessibilityLabel={`Categoría de ${team.name}`}>
        <Text style={s.subtitle}>{team.name}</Text><Text style={s.text}>{team.category ?? 'Sin categoría'}{team.archivedAt ? ' · Archivado' : ''}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Editar categoría de ${team.name}`} style={s.secondary} disabled={busy || !data.teamCategoriesReady} onPress={() => setCategoryEditor(team)}><Text style={s.blue}>Asignar categoría</Text></Pressable>
        <View style={s.controls}>{([{ action:'rename',label:'Cambiar nombre' },{ action:team.archivedAt?'restore':'archive',label:team.archivedAt?'Restaurar':'Archivar' },{ action:'delete',label:'Eliminar si está vacío' }] as {action:TeamAction;label:string}[]).map(item => <Pressable key={item.action} accessibilityRole="button" accessibilityLabel={`${item.label} ${team.name}`} disabled={busy || !data.teamManagementReady} style={s.secondary} onPress={() => setTeamAction({team,action:item.action})}><Text style={s.blue}>{item.label}</Text></Pressable>)}</View>
        {team.archivedAt && <Pressable accessibilityRole="button" accessibilityLabel={`Consultar historial de ${team.name}`} disabled={busy} style={s.secondary} onPress={() => onOpenTeam(team)}><Text style={s.blue}>Consultar historial</Text></Pressable>}
      </View>)}
    </View>}
    <TextInput accessibilityLabel="Buscar usuarios" style={s.input} value={query} onChangeText={setQuery} placeholder="Buscar por nombre, correo o equipo" placeholderTextColor="#718096" />
    <Text style={s.small}>{users.length} {users.length === 1 ? 'usuario' : 'usuarios'}</Text>
    {!users.length && <Text style={s.text}>No hay usuarios con esa búsqueda.</Text>}
    {users.map(user => <View key={user.id} style={s.card} accessibilityLabel={`Usuario ${user.email}`}>
      <Text style={s.subtitle}>{user.name || user.email}</Text><Text style={s.text}>{user.email}</Text>
      <Text style={s.blue}>{user.role === 'admin' ? 'Administrador' : 'Entrenador'} · {user.enabled ? 'Activo' : 'Desactivado'}</Text>
      {user.role === 'coach' && user.canReviewExercises && <Text style={s.blue}>Revisor de ejercicios{!user.enabled ? ' · Cuenta desactivada' : ''}</Text>}
      <Text style={s.text}>{user.role === 'admin' ? 'Acceso a todos los equipos del club' : user.teamIds.map(id => data.teams.find(team => team.id === id)?.name ?? 'Equipo no disponible').join(' · ') || 'Sin equipos asignados'}</Text>
      {user.role === 'coach' && <Pressable accessibilityRole="button" accessibilityLabel={`Gestionar acceso de ${user.email}`} disabled={busy} style={s.secondary} onPress={() => { setError(''); setNotice(''); setAccessEditor(user); }}><Text style={s.blue}>Equipos y acceso</Text></Pressable>}
      {user.role === 'coach' && <Pressable accessibilityRole="button" accessibilityLabel={`Gestionar revisión metodológica de ${user.email}`} disabled={busy || !data.exerciseReviewersReady} style={s.secondary} onPress={() => setReviewerEditor(user)}><Text style={s.blue}>Revisión metodológica</Text></Pressable>}
    </View>)}
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={openGuide}><Text style={s.blue}>Guía de activación de Usuarios</Text></Pressable>
    {form && <CoachAccountForm teams={activeTeams} busy={busy} onCreate={create} onClose={() => setForm(false)} onSetup={openGuide} />}
    {accessEditor && <CoachAccessEditor key={accessEditor.id} user={accessEditor} teams={data.teams} busy={busy} onSave={saveAccess} onClose={() => setAccessEditor(null)} />}
    {categoryEditor && <TeamCategoryEditor key={categoryEditor.id} team={categoryEditor} busy={busy} onSave={saveTeamCategory} onClose={() => setCategoryEditor(null)} />}
    {reviewerEditor && <ExerciseReviewerEditor key={reviewerEditor.id} user={reviewerEditor} busy={busy} onSave={saveReviewer} onClose={() => setReviewerEditor(null)} />}
    {teamAction && <TeamManagementDialog key={`${teamAction.team.id}:${teamAction.action}`} team={teamAction.team} action={teamAction.action} busy={busy} onSave={manageTeam} onClose={() => setTeamAction(null)} />}
    {teamEditor && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) setTeamEditor(null); }}><View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Crear equipo</Text><Text style={s.label}>Nombre del equipo</Text><TextInput accessibilityLabel="Nombre del nuevo equipo" style={s.input} value={teamEditor.name} onChangeText={name => setTeamEditor({ ...teamEditor, name })} editable={!busy} maxLength={80} />
      {data.teamCategoriesReady && <TeamCategoryPicker value={teamEditor.category ?? null} onChange={category => setTeamEditor({ ...teamEditor, category })} disabled={busy} />}
      {!!teamError && <Text accessibilityRole="alert" style={s.error}>{teamError}</Text>}
      {teamSetupNeeded && <TeamCategoriesSetup />}
      <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => void createTeam()}><Text style={s.white}>{busy ? 'Guardando…' : 'Guardar equipo'}</Text></Pressable><Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={() => setTeamEditor(null)}><Text style={s.blue}>Cancelar</Text></Pressable>
    </ScrollView></View></View></Modal>}
  </View>;
}
