// ─────────────────────────────────────────────────────────────────
// SMOKE TEST — clicks through the whole app and reports any errors.
//
// Runs in a browser against a TEST COPY of the data, never the real
// data (switching warehouses etc. saves). Steps:
//   1. tests/make-test-copy.sh            → builds .claude/synctest/, the
//      app pointed at SYNC_PATH/synctest-copy (git-ignored)
//   2. serve the repo folder (python3 -m http.server 8080), log in at
//      http://localhost:8080/index.html
//   3. on that page, load this file and copy the real data across:
//        eval(await (await fetch('/tests/smoke-test.js')).text());
//        await smokeTest.prepare();
//   4. open http://localhost:8080/.claude/synctest/index.html, load this
//      file the same way, then:  await smokeTest.run()
//      → { ok, steps, errors }
//   5. back on any logged-in page:  await smokeTest.cleanup()
//
// Read-only for anything outside the test copy: modals are opened and
// cancelled, never saved; print/export/import are skipped.
// ─────────────────────────────────────────────────────────────────

window.smokeTest = (() => {
  const REAL_PATH = 'Plattegrond-111ws-qbh3Tm791';
  const TEST_PATH = REAL_PATH + '/synctest-copy';
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  async function prepare(){
    const db = firebase.database();
    const raw = (await db.ref(REAL_PATH + '/data').once('value')).val();
    if(!raw) throw new Error('no real data found to copy');
    await db.ref(TEST_PATH + '/data').set(raw);
    return 'test copy ready (' + raw.length + ' bytes)';
  }

  async function cleanup(){
    await firebase.database().ref(TEST_PATH).remove();
    try{ localStorage.removeItem('yard-plan-state-v2'); }catch(e){}
    return 'test copy removed';
  }

  async function run(){
    if(typeof SYNC_PATH === 'undefined' || SYNC_PATH !== TEST_PATH){
      throw new Error('refusing to run: this page is not the test copy (SYNC_PATH is ' + (typeof SYNC_PATH === 'undefined' ? 'unset' : SYNC_PATH) + ')');
    }
    const errors = [];
    const steps = [];
    let current = 'start';
    const origError = console.error;
    console.error = (...args) => { errors.push({ step: current, message: args.map(String).join(' ').slice(0, 300) }); origError.apply(console, args); };
    const onError = (e) => errors.push({ step: current, message: String(e.message || e.reason || e).slice(0, 300) });
    const onRejection = (e) => errors.push({ step: current, message: 'unhandled: ' + String(e.reason && e.reason.message || e.reason).slice(0, 300) });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    const overlayOpen = () => document.getElementById('overlay').classList.contains('show');
    // Only ever cancel/close/done — never "✕", which in several modals
    // deletes something (a vehicle type, an occupant) instead of closing.
    async function closeAnyModal(){
      const buttons = () => [...document.querySelectorAll('#modalBody button')];
      for(let i = 0; i < 4 && overlayOpen(); i++){
        const btn = buttons().find(b => /^(annuleren|sluiten)$/i.test(b.textContent.trim()))
          || (i >= 1 && buttons().find(b => /^klaar$/i.test(b.textContent.trim())));
        if(btn) btn.click();
        else document.getElementById('overlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await wait(150);
      }
      if(overlayOpen()) errors.push({ step: current, message: 'modal would not close' });
    }
    async function step(name, fn){
      current = name;
      try{ await fn(); }
      catch(e){ errors.push({ step: name, message: 'step threw: ' + (e && e.message || e) }); }
      await wait(250);
      await closeAnyModal();
      steps.push(name);
    }
    const clickText = (root, re) => {
      const el = [...root.querySelectorAll('button, .btn')].find(b => re.test(b.textContent.trim()));
      if(!el) throw new Error('button not found: ' + re);
      el.click();
    };

    // wait for the first sync
    for(let i = 0; i < 40 && !/gesynchroniseerd/.test(document.body.innerText); i++) await wait(250);
    if(!/gesynchroniseerd/.test(document.body.innerText)) errors.push({ step: 'start', message: 'never synced with the test copy' });

    // feature tabs
    const featureNames = [...document.querySelectorAll('#whTabs .wh-tab .wh-tab-name-text')].map(e => e.textContent.trim());
    for(const name of featureNames){
      const tabEl = () => [...document.querySelectorAll('#whTabs .wh-tab')].find(t => t.querySelector('.wh-tab-name-text')?.textContent.trim() === name);
      await step('tab: ' + name, async () => { tabEl().click(); await wait(500); });
      if(/Planning/.test(name)){
        for(const view of ['day', 'week', 'month']){
          await step('planning view: ' + view, async () => { document.querySelector(`.pln-view-btn[data-view="${view}"]`).click(); await wait(300); });
        }
        await step('planning: previous/next/today', async () => {
          document.getElementById('plnPrevBtn').click(); await wait(200);
          document.getElementById('plnNextBtn').click(); await wait(200);
          document.getElementById('plnTodayBtn').click(); await wait(200);
        });
        await step('planning: new appointment form', async () => { document.getElementById('plnAddBtn').click(); await wait(300); });
        await step('planning: Ophalen option', async () => {
          document.getElementById('plnAddBtn').click(); await wait(300);
          document.querySelector('#plnKindRow [data-kind="ophalen"]')?.click(); await wait(300);
        });
      }
      if(/Agenda/.test(name)){
        await step('agenda: new appointment form', async () => { clickText(document.getElementById('plan'), /^\+ Nieuwe afspraak$/); await wait(300); });
        await step('agenda: history toggle', async () => {
          clickText(document.getElementById('plan'), /^Geschiedenis tonen/); await wait(300);
          clickText(document.getElementById('plan'), /^Geschiedenis verbergen/); await wait(300);
        });
      }
    }

    // every warehouse, and the first few spot forms in it
    const whCount = document.querySelectorAll('#whTabsWarehouses .wh-tab').length;
    for(let i = 0; i < whCount; i++){
      const tab = () => document.querySelectorAll('#whTabsWarehouses .wh-tab')[i];
      const whName = tab().querySelector('.wh-tab-name-text')?.textContent.trim() || ('#' + i);
      await step('warehouse: ' + whName, async () => { tab().querySelector('.wh-tab-name-text').click(); await wait(400); });
      const spots = [...document.querySelectorAll('.spot:not(.gap):not(.drag-ghost)')].slice(0, 3);
      for(let s = 0; s < spots.length; s++){
        await step(`warehouse ${whName}: spot form ${s + 1}`, async () => {
          document.querySelectorAll('.spot:not(.gap):not(.drag-ghost)')[s].click(); await wait(300);
          if(!overlayOpen()) throw new Error('spot form did not open');
        });
      }
    }

    // toolbar dialogs (print/export/import skipped: they open system dialogs)
    for(const id of ['backupsBtn', 'prijslijstBtn', 'blockedDatesBtn', 'manageTypesBtn']){
      const btn = document.getElementById(id);
      if(!btn || btn.style.display === 'none') continue;
      await step('toolbar: ' + btn.textContent.trim(), async () => { btn.click(); await wait(700); });
    }

    // search
    await step('search', async () => {
      const input = document.getElementById('searchInput');
      input.value = 'a'; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(400);
      input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(200);
    });

    console.error = origError;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    return { ok: errors.length === 0, stepsRun: steps.length, steps, errors };
  }

  return { prepare, run, cleanup };
})();
