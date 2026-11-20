const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {officialProduct} = require('../core/steam.cjs');

test('the welcome grid contains all twelve reference products with local art and official links', async () => {
  const {games,achievements} = await import('../public/games.js');
  assert.deepEqual(games.map(g=>g.id), [1091500,1174180,1245620,1817070,2638890,993090,2215430,271590,1888930,3764200,322170,3164500]);
  for (const g of games) {
    assert.equal(officialProduct(g.url),g.url);
    assert.ok(fs.existsSync(path.join(__dirname,'../public/assets',`${g.image}.jpg`)));
  }
  assert.ok([...achievements].every(id=>games.some(g=>g.id===id)));
  assert.equal(achievements.has(993090),false);
});

test('the editorial weekly selection changes on Monday UTC without pretending to be a chart', async () => {
  const {weeklyGames} = await import('../public/games.js');
  const mon=Date.UTC(2026,10,23), ids=t=>weeklyGames(t).map(g=>g.id);
  assert.equal(new Set(ids(mon)).size,8);
  assert.deepEqual(ids(mon),ids(mon+5*86400000));
  assert.notDeepEqual(ids(mon),ids(mon-1));
  assert.ok(!ids(mon).includes(993090));
});
