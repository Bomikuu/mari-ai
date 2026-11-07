import { AGENT_CATEGORIES, AGENT_PORTRAITS } from '../../shared/agent-catalog.js';

export function validateProfilePreview(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Choose a JSON profile object exported from Mari.');
  const profile = Object.hasOwn(document, 'profile') ? document.profile : document;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('The profile must be a JSON object.');
  for (const field of ['name', 'role', 'description', 'instructions']) {
    if (profile[field] !== undefined && typeof profile[field] !== 'string') throw new Error(`Profile ${field} must be text.`);
  }
  if (!profile.name?.trim() || !profile.instructions?.trim()) throw new Error('The profile needs a name and instructions.');
  if (profile.skillIds !== undefined && (!Array.isArray(profile.skillIds) || profile.skillIds.some((id) => typeof id !== 'string'))) throw new Error('Skill bindings must be a list of installed skill IDs.');
  for (const field of ['canDelegate', 'archived']) if (profile[field] !== undefined && typeof profile[field] !== 'boolean') throw new Error(`Profile ${field} must be true or false.`);
  if (profile.enabled !== undefined && typeof profile.enabled !== 'boolean') throw new Error('Profile enabled must be true or false.');
  if (profile.category !== undefined && !AGENT_CATEGORIES.some((item) => item.id === profile.category)) throw new Error('Choose an available agent category.');
  if (profile.portraitId != null && !AGENT_PORTRAITS.some((item) => item.id === profile.portraitId)) throw new Error('Choose an available portrait or use initials.');
  return document;
}
