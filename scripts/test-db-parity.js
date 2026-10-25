// Runs the same scenario against the JSON store and an in-process Postgres (PGlite) and compares results.
import { PGlite } from '@electric-sql/pglite';
import { makePgApi } from '../server/db-pg.js';
import jsonApi from '../server/db.js';
import assert from 'node:assert/strict';

const pg = new PGlite();
const pgApi = await makePgApi((sql, params) => params ? pg.query(sql, params) : pg.exec(sql).then(r => r[r.length - 1] || { rows: [] }));
const mk = (id, name) => ({ id, username: name, email: name + '@x.test', password_hash: 'h', display_name: name, avatar: 'A', level: 1, xp: 0, created_at: 'c' });

async function scenario(api) {
  const out = {};
  await api.createUser(mk('u1', 'alice')); await api.createUser(mk('u2', 'bob'));
  out.byEmail = !!(await api.findByEmail('ALICE@x.test')); out.byName = !!(await api.findByUsername('bob'));
  out.safe = Object.keys(await api.findById('u1')).includes('password_hash');
  await api.updateProfile('u1', 'Alice2', null); out.display = (await api.findById('u1')).display_name; out.avatar = (await api.findById('u1')).avatar;
  await api.upsertSave('u1', '{"a":1}'); await api.upsertSave('u1', '{"a":2}'); out.save = (await api.getSave('u1')).data;
  await api.upsertTournament('u1', 'alice', 50, 'W1'); await api.upsertTournament('u1', 'alice', 40, 'W1'); await api.upsertTournament('u2', 'bob', 60, 'W1');
  out.board = (await api.getLeaderboard('W1')).map(r => r.username + ':' + r.score);
  out.rank = [await api.getUserRank('u1', 'W1'), await api.getUserRank('u2', 'W1'), await api.getUserRank('nobody', 'W1')];
  await api.unlockAchievement('u1', 'x'); await api.unlockAchievement('u1', 'x'); out.ach = (await api.getAchievements('u1')).map(a => a.achievement_id);
  await api.saveDuel('r1', 'u1', 'u1', 'u2', 5, 3); out.total = await api.getTotalUsers();
  out.deleted = !!(await api.deleteUser('u1'));
  out.afterDelete = [await api.findById('u1'), await api.getSave('u1'), (await api.getLeaderboard('W1')).length, (await api.getAchievements('u1')).length].map(x => x && x.length !== undefined ? x : (x ? 'present' : x));
  out.total2 = await api.getTotalUsers(); out.deletedAgain = !!(await api.deleteUser('u1'));
  return out;
}
const a = await scenario(jsonApi), b = await scenario(pgApi);
console.log(JSON.stringify(a)); console.log(JSON.stringify(b));
assert.deepEqual(a, b); console.log('PARITY OK');
process.exit(0);
