import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Mutating E2E is restricted to a disposable loopback server.');
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push({ name, passed: true }); };
function client() {
  let cookie = '';
  async function request(path, opts = {}) {
    const response = await fetch(base + path, { ...opts, redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}), ...opts.headers } });
    for (const value of response.headers.getSetCookie()) cookie = value.split(';')[0];
    return response;
  }
  async function rpc(name, input, mutation = false) {
    const encoded = JSON.stringify({ json: input ?? null });
    const response = await request(`/api/trpc/${name}${mutation ? '' : `?input=${encodeURIComponent(encoded)}`}`, mutation ? { method: 'POST', body: encoded } : {});
    const body = await response.json();
    return { status: response.status, data: body.result?.data?.json, error: body.error?.json?.data?.code, headers: response.headers };
  }
  return { request, rpc, savedCookie: () => cookie };
}
const first = client(); const second = client();
try {
  check('liveness available', (await first.request('/api/health')).status === 200);
  check('database and safety tables ready', (await first.request('/api/ready')).status === 200);
  check('anonymous application read denied', (await first.rpc('application.myApplications')).status === 401);
  check('cross-origin mutation denied', (await first.request('/api/auth/login', { method: 'POST', headers: { origin: 'https://untrusted.invalid' }, body: '{}' })).status === 403);
  check('malformed JSON classified400', (await first.request('/api/auth/login', { method: 'POST', body: '{' })).status === 400);
  const seed = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  for (const [i, c] of [first, second].entries()) {
    const res = await c.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `readiness-${seed}-${i}@example.test`, password: `Disposable-${seed}-Only!`, name: 'Synthetic Researcher' }) });
    check(`synthetic researcher${i + 1} registered`, res.status === 200);
    check('session cookie uses HttpOnly and Secure', /httponly/i.test(res.headers.get('set-cookie')) && /secure/i.test(res.headers.get('set-cookie')));
  }
  const created = await first.rpc('application.create', {}, true);
  check('draft created', created.status === 200 && Number.isInteger(created.data?.id));
  const id = created.data.id;
  const own = await first.rpc('application.getById', { id });
  check('researcher can read own draft', own.status === 200);
  check('application responses never cached', /no-store/.test(own.headers.get('cache-control')));
  check('cross-user draft read denied', [403,404].includes((await second.rpc('application.getById', { id })).status));
  check('incomplete submission rejected', [400,409,412].includes((await first.rpc('application.submit', { id }, true)).status));
  const upload = await first.rpc('application.uploadFile', { applicationId:id, fileName:'synthetic.txt', fileData:Buffer.from('Synthetic protocol only. No personal data.').toString('base64'), contentType:'text/plain', category:'other' }, true);
  check('private upload stored', upload.status === 200 && typeof upload.data?.url === 'string');
  if (upload.data?.url) {
    const path = new URL(upload.data.url, base).pathname;
    const authorized = await first.request(path);
    check('owner receives authorized storage redirect', authorized.status === 302);
    const destination = new URL(authorized.headers.get('location'), base);
    check('synthetic file resolves to same-origin private storage', destination.origin === new URL(base).origin && destination.pathname.startsWith('/uploads/'));
    const download = await first.request(destination.pathname);
    check('owner retrieves correct private file', download.status === 200 && (await download.text()) === 'Synthetic protocol only. No personal data.');
    check('anonymous direct storage access denied', (await fetch(destination)).status === 401);
    check('other user cannot retrieve private file', [403,404].includes((await second.request(path)).status));
    check('anonymous cannot retrieve private file', (await fetch(base+path)).status === 401);
  }
  check('active HTML upload rejected', (await first.rpc('application.uploadFile', { applicationId:id, fileName:'bad.html', fileData:Buffer.from('<script>bad()</script>').toString('base64'), contentType:'text/html' },true)).status === 400);
  check('admin roster denied to researcher', (await first.rpc('admin.allCommitteeMembers')).status === 403);
  check('owner AI swarm denied to researcher', (await first.rpc('aiSwarm.byApplication',{applicationId:id})).status === 403);
  const mcp = await first.request('/api/mcp', {method:'POST',headers:{accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  const mc = await mcp.json();
  check('authenticated MCP tools available', mcp.status ===200 && Array.isArray(mc.result?.tools));
  check('MCP researcher cannot discover admin tools', !mc.result.tools.some(t=>t.name.includes('admin')));
  const saved = first.savedCookie();
  check('logout persisted', (await first.rpc('auth.logout', undefined, true)).status ===200);
  const replay = await fetch(`${base}/api/trpc/application.myApplications`, {headers:{cookie:saved,origin:base}});
  check('logged-out cookie replay rejected', replay.status ===401);
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.goto(base+'/',{waitUntil:'networkidle'});
    check('home renders a visible heading', await page.locator('h1').isVisible());
    check('no horizontal overflow on mobile', await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.goto(base+'/auth',{waitUntil:'networkidle'});
    check('private auth route carries noindex', (await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'));
    check('browser no uncaught runtime errors', errors.length===0);
    await mkdir('/tmp/irb-e2e',{recursive:true});
    await page.screenshot({path:'/tmp/irb-e2e/auth-mobile.png',fullPage:true});
  } finally { await browser.close(); }
} catch(error) { checks.push({ name:error.message,passed:false }); process.exitCode=1; }
await mkdir('/tmp/irb-e2e',{recursive:true});
await writeFile('/tmp/irb-e2e/readiness.json',JSON.stringify({testedAt:new Date().toISOString(),base,checks},null,2));
console.log(JSON.stringify({passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed)},null,2));
