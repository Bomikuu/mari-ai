import express from 'express';
import { id, now } from './store.js';
import { codexSkillsInventory } from './codex-resources.js';
import { AGENT_CATEGORIES, AGENT_PORTRAITS, AGENT_PROFILE_TEMPLATES } from '../shared/agent-catalog.js';
export { AGENT_PROFILE_TEMPLATES } from '../shared/agent-catalog.js';

const fail = (message, status = 400, code = 'INVALID_PROFILE') => Object.assign(new Error(message), { status, code });
const FIELDS = ['name', 'role', 'description', 'instructions', 'skillIds', 'enabled', 'category', 'portraitId', 'canDelegate', 'archived'];

function text(value, label, max, required = false) {
  if (typeof value !== 'string') throw fail(`${label} must be text.`);
  const result = value.trim();
  if ((required && !result) || result.length > max) throw fail(`${label} must contain ${required ? '1' : '0'}–${max.toLocaleString('en-US')} characters.`);
  return result;
}

export function validateAgentProfile(input, previous = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('An agent profile must be a JSON object.');
  const unknown = Object.keys(input).filter((key) => !FIELDS.includes(key) && key !== 'projectId');
  if (unknown.length) throw fail(`Unsupported profile field: ${unknown[0]}. Profiles contain instructions and installed skill selections only.`);
  const value = { ...previous, ...input };
  if (!Array.isArray(value.skillIds ?? []) || (value.skillIds ?? []).length > 32 || (value.skillIds ?? []).some((item) => typeof item !== 'string' || !/^skill_[a-f0-9]{32}$/.test(item))) throw fail('Choose at most 32 installed Codex skills.');
  for (const field of ['canDelegate', 'archived']) if (value[field] !== undefined && typeof value[field] !== 'boolean') throw fail(`${field} must be true or false.`);
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw fail('Enabled must be true or false.');
  if (value.category !== undefined && !AGENT_CATEGORIES.some((item) => item.id === value.category)) throw fail('Choose an available agent category.');
  if (value.portraitId != null && !AGENT_PORTRAITS.some((item) => item.id === value.portraitId)) throw fail('Choose an available portrait or use initials.');
  return { name: text(value.name, 'Name', 80, true), role: text(value.role ?? 'Codex agent', 'Role', 120), description: text(value.description ?? '', 'Description', 1000), instructions: text(value.instructions, 'Instructions', 16000, true), skillIds: [...new Set(value.skillIds || [])], enabled: value.enabled !== false, canDelegate: value.canDelegate === true, archived: value.archived === true, category: value.category ?? 'general', portraitId: value.portraitId ?? null };
}

function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }

export async function resolveAgentProfile(store, profileId, { projectId, personal = false, inventory = codexSkillsInventory } = {}) {
  if (!profileId || profileId === 'default') return null;
  const profile = store.get('agentProfiles', profileId);
  if (!profile) throw fail('Selected agent profile was not found.', 404, 'PROFILE_NOT_FOUND');
  if (!profile.enabled) throw fail('Selected agent profile is disabled. Choose an enabled profile.', 409, 'PROFILE_DISABLED');
  const valid = validateAgentProfile(Object.fromEntries(FIELDS.map((key) => [key, profile[key]])));
  const skills = await inventory.resolve(store, valid.skillIds, { projectId, personal });
  return frozen({ id: profile.id, name: valid.name, role: valid.role, description: valid.description, instructions: valid.instructions, category: valid.category, portraitId: valid.portraitId, canDelegate: valid.canDelegate, skills, updatedAt: profile.updatedAt, capturedAt: now() });
}

function profileRecord(store, profileId) {
  const profile = store.get('agentProfiles', profileId);
  if (!profile) throw fail('Agent profile was not found.', 404, 'PROFILE_NOT_FOUND');
  return profile;
}

export function createResourcesRouter({ store, inventory = codexSkillsInventory }) {
  const router = express.Router();
  const save = async (input, previous = null) => {
    const fields = validateAgentProfile(input, previous);
    await inventory.resolve(store, fields.skillIds, { projectId: input.projectId });
    if (store.list('agentProfiles').some((p) => p.id !== previous?.id && p.name.trim().toLocaleLowerCase() === fields.name.toLocaleLowerCase())) throw fail('An agent already has this name. Choose a unique name.', 409, 'PROFILE_NAME_TAKEN');
    const profile = store.put('agentProfiles', { ...fields, id: previous?.id || id('profile'), createdAt: previous?.createdAt || now() });
    store.event({ source: 'system', type: previous ? 'profile.updated' : 'profile.created', message: `${previous ? 'Updated' : 'Configured'} Codex profile ${profile.name}.`, data: { profileId: profile.id } });
    return profile;
  };
  router.get('/skills', async (req, res) => res.json(await inventory.list(store, { projectId: req.query.projectId, global: req.query.scope === 'global', refresh: req.query.refresh === '1' })));
  router.get('/skills/:id', async (req, res) => res.json(await inventory.read(store, req.params.id, { projectId: req.query.projectId, global: req.query.scope === 'global' })));
  router.get('/agent-profiles', (req, res) => res.json({ profiles: store.list('agentProfiles'), templates: AGENT_PROFILE_TEMPLATES }));
  router.post('/agent-profiles', async (req, res) => res.status(201).json({ profile: await save(req.body) }));
  router.post('/agent-profiles/import', async (req, res) => {
    if (Buffer.byteLength(JSON.stringify(req.body ?? null)) > 64 * 1024) throw fail('Profile imports are limited to 64 KiB.', 413, 'PROFILE_TOO_LARGE');
    let input = req.body;
    if (input && Object.hasOwn(input, 'profile')) {
      if (Object.keys(input).some((key) => !['schemaVersion', 'profile', 'projectId'].includes(key)) || (input.schemaVersion !== undefined && input.schemaVersion !== 1)) throw fail('Unsupported profile import format.');
      input = { ...input.profile, ...(input.projectId ? { projectId: input.projectId } : {}) };
    }
    res.status(201).json({ profile: await save(input) });
  });
  router.post('/agent-profiles/install', async (req, res) => {
    if (!req.body || Object.keys(req.body).some((key) => !['templateId', 'projectId'].includes(key))) throw fail('Choose a built-in profile template.');
    const template = AGENT_PROFILE_TEMPLATES.find((item) => item.id === req.body.templateId);
    if (!template) throw fail('Built-in profile template was not found.', 404, 'NOT_FOUND');
    const { id: templateId, ...fields } = template;
    res.status(201).json({ profile: await save({ ...fields, projectId: req.body.projectId }) });
  });
  router.patch('/agent-profiles/:id', async (req, res) => res.json({ profile: await save(req.body, profileRecord(store, req.params.id)) }));
  router.delete('/agent-profiles/:id', (req, res) => {
    const profile = profileRecord(store, req.params.id);
    store.remove('agentProfiles', profile.id);
    store.event({ source: 'system', type: 'profile.deleted', message: `Removed configured Codex profile ${profile.name}.`, data: { profileId: profile.id } });
    res.json({ deleted: true });
  });
  router.get('/agent-profiles/:id/export', (req, res) => {
    const profile = profileRecord(store, req.params.id);
    res.setHeader('Content-Disposition', `attachment; filename="${profile.name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'agent-profile'}.json"`);
    res.json({ schemaVersion: 1, profile: Object.fromEntries(FIELDS.map((key) => [key, profile[key]])) });
  });
  return router;
}

// Only exact built-in legacy identities are migrated; user-defined names and history stay intact.
export function migrateAgentNames(store) {
  if (store.get('settings', 'agent-character-names-v1')) return;
  const oldNames = ['CEO', 'Business analyst', 'Product manager', 'Designer', 'Builder', 'Backend engineer', 'Reviewer', 'Security reviewer', 'Marketing strategist', 'Content writer', 'Project coordinator', 'Research analyst'];
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const profiles = store.list('agentProfiles');
    for (let i = 0; i < AGENT_PROFILE_TEMPLATES.length; i++) {
      const template = AGENT_PROFILE_TEMPLATES[i];
      const candidates = profiles.filter(p => p.portraitId === template.portraitId && [oldNames[i], `Mari ${oldNames[i]}`].includes(p.name));
      candidates.sort((a, b) => (b.skillIds?.length || 0) - (a.skillIds?.length || 0));
      const chosen = candidates[0];
      if (!chosen || profiles.some(p => p.id !== chosen.id && p.name.toLocaleLowerCase() === template.name.toLocaleLowerCase())) continue;
      store.update('agentProfiles', chosen.id, { name: template.name, ...(template.canDelegate ? { ...(chosen.role === 'strategy advisor' ? { role: 'CEO' } : {}), canDelegate: true } : {}) });
      for (const duplicate of candidates.slice(1)) store.update('agentProfiles', duplicate.id, { archived: true, enabled: false });
    }
    store.put('settings', { id: 'agent-character-names-v1', migratedAt: now() });
    store.db.exec('COMMIT');
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}
