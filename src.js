import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const db = url && key ? createClient(url, key) : null;
const app = document.querySelector('#app');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session = null, profile = null, family = [], trees = [], admin = false, tab = 'trees';

function notice(text, error = false) {
  const el = document.querySelector('#notice');
  if (el) { el.textContent = text; el.className = error ? 'error' : 'success'; }
}
function shell(content) {
  app.innerHTML = `<header><div class="brand">🌿 شجرتي <small>شركة أرض البركة للإنتاج الزراعي</small></div>${session ? '<button id="logout" class="ghost">خروج</button>' : ''}</header><main>${content}<p id="notice" role="status"></p></main>`;
  document.querySelector('#logout')?.addEventListener('click', () => db.auth.signOut());
}
function render() {
  if (!db) { shell('<section><h2>إعداد الاتصال</h2><p>أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY إلى إعدادات Vercel.</p></section>'); return; }
  if (!session) {
    shell(`<section class="hero"><h1>ازرع شجرة… واترك أثرًا</h1><p>مبادرة رالي تي تي 2026 — سجل عائلتك وتابع أشجارها في واحة أرض البركة.</p></section>
      <section><h2>تسجيل الدخول</h2><form id="login"><label>البريد الإلكتروني</label><input name="email" type="email" autocomplete="email" required><label>كلمة المرور</label><input name="password" type="password" autocomplete="current-password" required><button>دخول</button></form></section>
      <section><h2>إنشاء حساب جديد</h2><form id="signup"><label>الاسم</label><input name="name" maxlength="80" required><label>البريد الإلكتروني</label><input name="email" type="email" autocomplete="email" required><label>كلمة المرور (8 أحرف على الأقل)</label><input name="password" type="password" minlength="8" autocomplete="new-password" required><button>إنشاء حساب</button></form></section>`);
    document.querySelector('#login').addEventListener('submit', signIn);
    document.querySelector('#signup').addEventListener('submit', signUp);
    return;
  }
  shell(`<section class="hero"><h1>مرحبًا ${escapeHtml(profile?.display_name || session.user.user_metadata?.display_name || 'بك')} 🌱</h1><p>كل شجرة تحمل اسمًا، وكل اسم يترك أثرًا أخضر.</p></section><nav><button data-tab="trees">أشجار عائلتي</button><button data-tab="family">أفراد العائلة</button><button data-tab="claim">ربط شجرة</button>${admin ? '<button data-tab="admin">إدارة الشركة</button>' : ''}</nav><div id="content"></div>`);
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; view(); }));
  view();
}
async function signIn(e) {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const { error } = await db.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
  if (error) notice(error.message, true);
}
async function signUp(e) {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const { data, error } = await db.auth.signUp({ email: String(f.get('email')).trim(), password: String(f.get('password')), options: { data: { display_name: String(f.get('name')).trim() } } });
  if (error) return notice(error.message, true);
  notice(data.session ? 'تم إنشاء الحساب وتسجيل الدخول.' : 'تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيد الحساب.');
}
async function load() {
  if (!session) return;
  const uid = session.user.id;
  const [p, f, t, a] = await Promise.all([
    db.from('profiles').select('*').eq('id', uid).maybeSingle(),
    db.from('family_members').select('*').eq('owner_id', uid).order('created_at'),
    db.from('trees').select('*,family_members(display_name)').eq('owner_id', uid).order('created_at', { ascending: false }),
    db.from('staff').select('role').eq('user_id', uid).maybeSingle()
  ]);
  profile = p.data; family = f.data || []; trees = t.data || []; admin = !!a.data;
  render();
  if (p.error || f.error || t.error || a.error) notice('تعذر تحميل بعض البيانات. تحقق من الجداول وصلاحيات RLS في Supabase.', true);
}
function view() {
  const c = document.querySelector('#content'); if (!c) return;
  if (tab === 'family') {
    c.innerHTML = `<section><h2>أفراد العائلة</h2><form id="addfamily"><label>الاسم</label><input name="name" maxlength="80" required><label>صلة القرابة</label><input name="relation" maxlength="50"><button>إضافة فرد</button></form><div class="cards">${family.map(x => `<article><h3>${escapeHtml(x.display_name)}</h3><p>${escapeHtml(x.relation || 'فرد من العائلة')}</p></article>`).join('')}</div></section>`;
    document.querySelector('#addfamily').addEventListener('submit', addFamily);
  } else if (tab === 'claim') {
    c.innerHTML = `<section><h2>ربط شجرة بالعائلة</h2><p>امسح رمز QR أو أدخل رمز الشجرة.</p><form id="claim"><label>رمز الشجرة</label><input name="code" required value="${escapeHtml(new URLSearchParams(location.search).get('tree') || '')}"><label>صاحب الشجرة</label><select name="member" required><option value="">اختر فرد العائلة</option>${family.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.display_name)}</option>`).join('')}</select><button>إرسال طلب الربط</button></form></section>`;
    document.querySelector('#claim').addEventListener('submit', claimTree);
  } else if (tab === 'admin' && admin) {
    c.innerHTML = `<section><h2>لوحة إدارة الشركة</h2><div class="stats"><div>الأشجار المسجلة<br><b id="count">—</b></div><div>طلبات الربط<br><b id="pending">—</b></div></div><form id="newtree"><h3>تسجيل شجرة جديدة</h3><label>رمز الشجرة</label><input name="code" placeholder="TT-2026-0001" required><label>النوع</label><select name="kind"><option value="olive">زيتون</option><option value="palm">نخيل</option></select><label>المنطقة / الصف</label><input name="location"><button>إضافة شجرة</button></form><div id="requests"></div></section>`;
    document.querySelector('#newtree').addEventListener('submit', newTree);
    loadAdmin();
  } else {
    c.innerHTML = `<section><h2>أشجار عائلتي (${trees.length})</h2><div class="cards">${trees.length ? trees.map(t => `<article><div class="emoji">${t.kind === 'palm' ? '🌴' : '🫒'}</div><h3>${escapeHtml(t.family_members?.display_name || 'بانتظار التخصيص')}</h3><p>${escapeHtml(t.code)} · ${t.kind === 'palm' ? 'نخيل' : 'زيتون'}</p><span class="pill">${escapeHtml(t.status)}</span><p>${escapeHtml(t.location_label || 'الموقع قيد التحديد')}</p><button data-detail="${escapeHtml(t.id)}" class="secondary">التفاصيل والشهادة</button></article>`).join('') : '<p>لم تُربط أشجار بحسابك بعد. أضف أفراد العائلة ثم اربط الشجرة.</p>'}</div><div id="detail"></div></section>`;
    document.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () => detail(b.dataset.detail)));
  }
}
async function addFamily(e) {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  const { error } = await db.from('family_members').insert({ owner_id: session.user.id, display_name: String(f.get('name')).trim(), relation: String(f.get('relation')).trim() });
  if (error) return notice(error.message, true);
  tab = 'family'; await load(); notice('تمت إضافة فرد العائلة');
}
async function claimTree(e) {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  const { error } = await db.rpc('request_tree_claim', { p_code: String(f.get('code')).trim().toUpperCase(), p_member_id: f.get('member') });
  if (error) return notice(error.message, true);
  e.currentTarget.reset(); notice('تم إرسال طلب الربط للمراجعة');
}
async function detail(id) {
  const t = trees.find(x => String(x.id) === String(id)); if (!t) return;
  const { data: updates, error } = await db.from('tree_updates').select('*').eq('tree_id', id).order('created_at', { ascending: false });
  if (error) return notice(error.message, true);
  const target = document.querySelector('#detail');
  target.innerHTML = `<section class="detail" id="certificate"><h2>شهادة غرس شجرة 🌿</h2><p>شركة أرض البركة للإنتاج الزراعي — رالي تي تي 2026</p><h1>${escapeHtml(t.family_members?.display_name || '')}</h1><p>شجرة ${t.kind === 'palm' ? 'نخيل' : 'زيتون'} رقم ${escapeHtml(t.code)}</p><p>الموقع: ${escapeHtml(t.location_label || 'غير محدد')}</p><p>الحالة: ${escapeHtml(t.status)}</p><div id="qr"></div><small>الشهادة تصدر بعد تأكيد الغرس</small></section><button id="pdf" ${t.status !== 'planted' ? 'disabled' : ''}>حفظ الشهادة PDF</button><section><h3>سجل العناية</h3>${(updates || []).map(u => `<article><b>${escapeHtml(u.activity_type)}</b><p>${escapeHtml(u.notes || '')}</p><small>${escapeHtml(new Date(u.created_at).toLocaleDateString('ar-LY'))}</small>${u.photo_url && /^https:\/\//i.test(u.photo_url) ? `<p><a href="${escapeHtml(u.photo_url)}" target="_blank" rel="noopener noreferrer">صورة المتابعة</a></p>` : ''}</article>`).join('') || '<p>لا توجد تحديثات بعد.</p>'}</section>`;
  try { const canvas = await QRCode.toCanvas(`${location.origin}/?tree=${encodeURIComponent(t.code)}`, { width: 140 }); document.querySelector('#qr')?.append(canvas); } catch (e) { notice('تعذر إنشاء رمز QR', true); }
  document.querySelector('#pdf').addEventListener('click', async () => {
    try { const canvas = await html2canvas(document.querySelector('#certificate'), { scale: 2 }); const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); const w = 190, h = canvas.height * w / canvas.width; pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, w, Math.min(h, 270)); pdf.save(`shajarti-${t.code}.pdf`); }
    catch (e) { notice('تعذر إنشاء ملف PDF', true); }
  });
}
async function newTree(e) {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  const { error } = await db.from('trees').insert({ code: String(f.get('code')).trim().toUpperCase(), kind: f.get('kind'), location_label: String(f.get('location')).trim() || null, status: 'available' });
  if (error) return notice(error.message, true);
  e.currentTarget.reset(); notice('تم تسجيل الشجرة'); loadAdmin();
}
async function loadAdmin() {
  const [total, pending] = await Promise.all([
    db.from('trees').select('*', { count: 'exact', head: true }),
    db.from('tree_claims').select('id,tree_id,member_id,requested_by,created_at,trees(code),family_members(display_name)', { count: 'exact' }).eq('status', 'pending').order('created_at')
  ]);
  const count = document.querySelector('#count'), pend = document.querySelector('#pending'), requests = document.querySelector('#requests');
  if (!count || !pend || !requests) return;
  count.textContent = total.count ?? '—'; pend.textContent = pending.count ?? '—';
  requests.innerHTML = `<h3>طلبات الربط</h3>${(pending.data || []).map(r => `<article><b>${escapeHtml(r.trees?.code)}</b> — ${escapeHtml(r.family_members?.display_name)}<p><button data-approve="${escapeHtml(r.id)}">تأكيد الغرس والربط</button></p></article>`).join('') || '<p>لا توجد طلبات معلقة.</p>'}`;
  document.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
    const { error } = await db.rpc('approve_tree_claim', { p_claim_id: b.dataset.approve });
    if (error) return notice(error.message, true);
    await load(); notice('تم تأكيد الغرس والربط');
  }));
  if (total.error || pending.error) notice('تعذر تحميل بيانات الإدارة. تحقق من صلاحيات Supabase.', true);
}
if (db) {
  db.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    if (session) setTimeout(() => load(), 0);
    else { profile = null; family = []; trees = []; admin = false; render(); }
  });
  db.auth.getSession().then(({ data, error }) => {
    if (error) { render(); return; }
    session = data.session;
    if (session) load(); else render();
  });
} else render();
