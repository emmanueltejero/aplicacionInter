import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { trainingStyles as s } from './trainingStyles';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
function standalone() {
  return typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
}
export function InstallApp() {
  const [installed, setInstalled] = useState(standalone);
  const [dismissed, setDismissed] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabled = typeof document !== 'undefined' && !!document.querySelector('link[rel="manifest"]');
  useEffect(() => {
    if (!enabled) return;
    const media = window.matchMedia('(display-mode: standalone)');
    const onMode = () => setInstalled(standalone());
    const onInstalled = () => { setInstalled(true); setHelp(false); setPrompt(null); };
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    media.addEventListener('change', onMode);
    if ('serviceWorker' in navigator) {
      const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
      const scope = new URL('./', manifest.href);
      if (scope.origin === window.location.origin) void navigator.serviceWorker.register(new URL('service-worker.js', scope), { scope: scope.pathname, updateViaCache: 'none' }).catch(() => {});
    }
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); media.removeEventListener('change', onMode); };
  }, [enabled]);
  async function install() {
    if (busy) return;
    if (!prompt) { setHelp(true); return; }
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true); else setHelp(true);
    } catch { setHelp(true); }
    finally { setPrompt(null); setBusy(false); }
  }
  if (!enabled || installed || dismissed) return null;
  return <>
    <View style={c.bar}>
      <Text style={c.label}>Inter en tu dispositivo</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Instalar aplicación" disabled={busy} style={c.install} onPress={() => void install()}><Text style={s.white}>{busy ? 'Abriendo…' : 'Instalar'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Ocultar aviso de instalación" disabled={busy} style={c.close} onPress={() => setDismissed(true)}><Text style={c.cross}>×</Text></Pressable>
    </View>
    {help && <Modal visible transparent animationType="fade" onRequestClose={() => setHelp(false)}><View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent}>
      <Text style={s.title}>Instalar Inter Playa Honda</Text>
      <Text style={s.text}>Tendrás el escudo en tu pantalla de inicio y podrás abrir la aplicación desde su icono.</Text>
      <Text style={s.subtitle}>Android · Chrome</Text><Text style={s.text}>Abre el menú ⋮, elige «Añadir a pantalla de inicio» o «Instalar aplicación» y confirma.</Text>
      <Text style={s.subtitle}>iPhone o iPad · Safari</Text><Text style={s.text}>Pulsa Compartir y elige «Añadir a pantalla de inicio». Si aparece «Abrir como app web», déjalo activado y pulsa Añadir.</Text>
      <Text style={s.subtitle}>Ordenador · Chrome o Edge</Text><Text style={s.text}>Pulsa el icono de instalación de la barra de direcciones o busca «Instalar» en el menú del navegador.</Text>
      <Text style={s.text}>Si estás dentro de ChatGPT, WhatsApp u otra aplicación, abre primero esta web en Chrome o Safari.</Text>
      <Text style={s.small}>Usa tu cuenta del club. Necesitas conexión para consultar o guardar datos; los PDF descargados se pueden abrir sin conexión. Las actualizaciones llegan desde la web.</Text>
      <Pressable accessibilityRole="button" style={s.primary} onPress={() => setHelp(false)}><Text style={s.white}>Entendido</Text></Pressable>
    </ScrollView></View></View></Modal>}
  </>;
}
const c = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#10151D', paddingHorizontal: 10, paddingVertical: 6 },
  label: { flex: 1, color: '#FFF', fontSize: 12 }, install: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#176BA0' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, cross: { color: '#FFF', fontSize: 24 },
});
