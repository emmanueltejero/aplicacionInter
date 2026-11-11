import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encryptFile, decryptFile } from '../scripts/backup/crypto.mjs';
import { createBackup, databaseUrl, dumpDatabase } from '../scripts/backup/create.mjs';
import { exportImages, restoreImages, storageHeaders, sha256 } from '../scripts/backup/storage.mjs';
import { clubTables, fileRecord, verifyBundle } from '../scripts/backup/bundle.mjs';

const origin = 'https://corcjvflavfpvzgyvpyb.supabase.co', target = 'https://abcdefghijklmnopqrst.supabase.co';
const password = 'Test-only-backup-password-with-32-plus-characters!';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const path = `${id(2)}/${id(100)}.jpg`, jpeg = Buffer.from([255, 216, 255, 217]);
const key = ['header', Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'), 'fake'].join('.');
const bucket = { id: 'exercise-images', public: false, file_size_limit: 204800, allowed_mime_types: ['image/jpeg'] };

test('encrypted backups roundtrip; wrong passwords, corrupted headers, ciphertext and tags fail without releasing plaintext', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inter-test-crypto-'));
  try {
    const input = join(dir, 'private.sql'), encrypted = join(dir, 'backup.enc'), output = join(dir, 'restored.sql');
    const secret = 'COPY auth.users: confidential fixture data'; await writeFile(input, secret);
    await encryptFile(input, encrypted, password); const bytes = await readFile(encrypted); assert.equal(bytes.includes(Buffer.from(secret)), false);
    await decryptFile(encrypted, output, password); assert.equal(await readFile(output, 'utf8'), secret);
    await assert.rejects(decryptFile(encrypted, output, password)); assert.equal(await readFile(output, 'utf8'), secret);
    await writeFile(join(dir, 'existing.partial'), 'preserve existing temporary file');
    await assert.rejects(decryptFile(encrypted, join(dir, 'existing'), password)); assert.equal(await readFile(join(dir, 'existing.partial'), 'utf8'), 'preserve existing temporary file');
    await encryptFile(input, join(dir, 'another.enc'), password); assert.notDeepEqual(await readFile(join(dir, 'another.enc')), bytes);
    await assert.rejects(decryptFile(encrypted, join(dir, 'wrong'), 'different-password-with-32-characters!!'), /contraseña incorrecta/);
    await assert.rejects(access(join(dir, 'wrong'))); await assert.rejects(access(join(dir, 'wrong.partial')));
    for (const n of [0, 75, bytes.length - 1]) {
      const damaged = Buffer.from(bytes); damaged[n] ^= 1; await writeFile(join(dir, 'damaged.enc'), damaged);
      await assert.rejects(decryptFile(join(dir, 'damaged.enc'), join(dir, 'damaged'), password)); await assert.rejects(access(join(dir, 'damaged.partial')));
    }
    await assert.rejects(encryptFile(input, join(dir, 'weak.enc'), 'short'), /32 caracteres/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('connection configuration binds to the same project, escapes passwords, requires SQL TLS and accepts only privileged Storage keys', () => {
  const template = 'postgresql://postgres.corcjvflavfpvzgyvpyb:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
  const url = new URL(databaseUrl(template, 'fixture:#/@%? password', origin));
  assert.equal(decodeURIComponent(url.password), 'fixture:#/@%? password'); assert.equal(url.searchParams.get('sslmode'), 'require');
  for (const bad of [template.replace(':5432', ':6543'), template.replace('corcjvflavfpvzgyvpyb', 'abcdefghijklmnopqrst'), template.replace('pooler.supabase.com', 'example.invalid')]) assert.throws(() => databaseUrl(bad, 'fixture', origin));
  assert.equal(storageHeaders(key).Authorization, 'Bearer ' + key); assert.deepEqual(storageHeaders('sb_secret_fixture'), { apikey: 'sb_secret_fixture' });
  assert.throws(() => storageHeaders('sb_publishable_fixture')); assert.throws(() => storageHeaders('h.' + Buffer.from('{"role":"anon"}').toString('base64url') + '.s'));
});
test('database export uses the pinned CLI documented commands, includes managed reference and stops on an export failure', async () => {
  const calls = []; await dumpDatabase('postgresql://fixture', '/tmp/fixture', async (command, args) => calls.push([command, args]));
  assert.equal(calls.length, 4); assert.ok(calls.every(([command, args]) => command === 'supabase' && args.includes('--remote=postgresql://fixture') && args.includes('--file')));
  assert.ok(calls[0][1].includes('--role-only')); assert.ok(calls[2][1].includes('--data-only')); assert.ok(calls[2][1].includes('--use-copy')); assert.ok(calls[3][1].includes('auth,storage'));
  let count = 0; await assert.rejects(dumpDatabase('fixture', '/tmp/fixture', async () => { count++; throw new Error('export failure'); })); assert.equal(count, 1);
});

test('Storage export paginates all historical files, hashes contents, never follows redirects and fails on missing files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inter-test-storage-'));
  try {
    const requests = [], paths = Array.from({ length: 101 }, (_, n) => `${id(2)}/${id(100 + n)}.jpg`);
    const mock = async (url, options) => {
      requests.push([url, options]); assert.equal(options.redirect, 'error'); assert.equal(options.headers.apikey, key);
      if (url.includes('/bucket/')) return Response.json(bucket);
      if (url.includes('/object/list/')) {
        const body = JSON.parse(options.body);
        if (!body.prefix) return Response.json([{ name: id(2), id: null, metadata: null }]);
        return Response.json(paths.slice(body.offset, body.offset + body.limit).map((p, n) => ({ name: p.split('/')[1], id: id(1000 + n), metadata: { mimetype: 'image/jpeg', size: jpeg.length } })));
      }
      return new Response(jpeg);
    };
    const result = await exportImages({ url: origin, key, directory: dir, fetchImpl: mock }); assert.equal(result.objects.length, 101);
    assert.ok(requests.some(([, o]) => o.body && JSON.parse(o.body).offset === 100));
    assert.equal(result.objects[0].sha256, sha256(jpeg)); assert.deepEqual(await readFile(join(dir, result.objects[0].file)), jpeg);
    await assert.rejects(restoreImages({ url: origin, key, directory: dir, manifest: { projectUrl: origin, storage: result }, fetchImpl: mock }), /nunca al original/);
    const uploads = [];
    await restoreImages({ url: target, key, directory: dir, manifest: { projectUrl: origin, storage: { ...result, objects: result.objects.slice(0, 1) } }, fetchImpl: async (u, o) => { if (u.includes('/bucket/')) return Response.json(bucket); uploads.push(o); return Response.json({}); } });
    assert.equal(uploads.length, 1); assert.equal(uploads[0].headers['x-upsert'], 'true'); assert.deepEqual(uploads[0].body, jpeg);
    const missingDir = join(dir, 'missing'); await mkdir(missingDir);
    await assert.rejects(exportImages({ url: origin, key, directory: missingDir, fetchImpl: async (u, o) => u.includes('/object/authenticated/') ? new Response('missing', { status: 404 }) : mock(u, o) }), /HTTP 404/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('bundle validation checks Auth accounts, all club tables and the actual files referenced by historic training data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inter-test-bundle-'));
  try {
    const data = [['auth', 'users'], ['auth', 'identities'], ...clubTables.map(t => ['public', t])].map(([s, t]) => `COPY "${s}"."${t}" (id) FROM stdin;\n\\.\n`).join('') + path;
    const contents = { 'roles.sql': '-- roles', 'schema.sql': 'provision_web_coach is_active_club_member valid_exercise_image_path exercise_review_content_changed', 'data.sql': data, 'managed-schema-reference.sql': 'club_web_coach_provision club_exercise_images_read club_exercise_images_upload', 'backup-managed-objects.sql': '-- managed', 'code.tar.gz': 'fixture archive', 'RECOVERY.md': 'fixture instructions' };
    const files = []; for (const [file, value] of Object.entries(contents)) { await writeFile(join(dir, file), value); files.push(await fileRecord(dir, file)); }
    const manifest = { version: 1, projectUrl: origin, files, storage: { bucket, objects: [] } }; await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(verifyBundle(dir), /Falta una imagen/);
    await mkdir(join(dir, 'images', id(2)), { recursive: true }); await writeFile(join(dir, 'images', path), jpeg);
    manifest.storage.objects.push({ path, file: 'images/' + path, bytes: jpeg.length, sha256: sha256(jpeg) }); await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
    await verifyBundle(dir); await writeFile(join(dir, 'images', path), Buffer.from('broken')); await assert.rejects(verifyBundle(dir), /dañada/);
    await writeFile(join(dir, 'images', path), jpeg); manifest.storage.objects[0].file = '../outside'; await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest)); await assert.rejects(verifyBundle(dir), /Ruta/);
    manifest.storage.objects[0].file = 'images/' + path; await writeFile(join(dir, 'data.sql'), data.replace('COPY "auth"."users"', 'COPY "auth"."missing"')); manifest.files = await Promise.all(files.map(record => fileRecord(dir, record.file))); await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest)); await assert.rejects(verifyBundle(dir), /cuentas requeridas/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('full backup pipeline publishes only authenticated ciphertext; opening verifies contents and a failed export publishes nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inter-test-pipeline-'));
  try {
    const env = { CLUB_DB_URL: 'postgresql://postgres.corcjvflavfpvzgyvpyb:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres', CLUB_DB_PASSWORD: 'fixture SQL password', CLUB_SUPABASE_KEY: key, CLUB_BACKUP_PASSWORD: password, CLUB_BACKUP_OUTPUT: join(dir, 'output') };
    const dependencies = {
      async dumpDatabase(_, destination) {
        const copies = [['auth', 'users'], ['auth', 'identities'], ...clubTables.map(t => ['public', t])].map(([s, t]) => `COPY "${s}"."${t}" (id) FROM stdin;\n\\.\n`).join('');
        for (const [name, contents] of Object.entries({ 'roles.sql': '-- roles fixture', 'schema.sql': 'provision_web_coach is_active_club_member valid_exercise_image_path exercise_review_content_changed', 'data.sql': copies + path, 'managed-schema-reference.sql': 'club_web_coach_provision club_exercise_images_read club_exercise_images_upload' })) await writeFile(join(destination, name), contents);
      },
      async exportImages({ directory }) {
        await mkdir(join(directory, 'images', id(2)), { recursive: true }); await writeFile(join(directory, 'images', path), jpeg);
        return { bucket, objects: [{ path, file: 'images/' + path, bytes: jpeg.length, sha256: sha256(jpeg), contentType: 'image/jpeg' }] };
      },
    };
    const output = await createBackup(env, dependencies);
    assert.ok(output.endsWith('.tar.gz.enc')); assert.equal((await readdir(env.CLUB_BACKUP_OUTPUT)).length, 1);
    const restored = join(dir, 'recovered');
    const result = await promisify(execFile)(process.execPath, ['scripts/backup/recover.mjs', 'open', output, restored], { env: { ...process.env, CLUB_BACKUP_PASSWORD: password } });
    assert.ok(result.stdout.includes('No se ha modificado Supabase'), JSON.stringify(result)); await verifyBundle(restored);
    const files = await readdir(restored); assert.ok(files.includes('code.tar.gz')); assert.ok(files.includes('backup-managed-objects.sql'));
    const badEnv = { ...env, CLUB_BACKUP_OUTPUT: join(dir, 'failed-output') };
    await assert.rejects(createBackup(badEnv, { ...dependencies, async exportImages() { throw new Error('fixture storage failure'); } }), /fixture storage failure/);
    assert.deepEqual(await readdir(badEnv.CLUB_BACKUP_OUTPUT), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
