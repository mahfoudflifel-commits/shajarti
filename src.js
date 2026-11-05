تعليمات تعديل src.js لتسجيل الدخول بالبريد الإلكتروني وكلمة المرور

1) احتفظ بنسخة احتياطية من src.js.
2) استبدل كتلة شاشة الدخول داخل render() (من :!session? حتى :`<main><section class="hero"><h1>مرحبًا) بكتلة الواجهة التالية، مع إبقاء بقية render كما هي:

:!session?`<main><section class="hero"><h1>ازرع شجرة… واترك أثرًا</h1><p>مبادرة رالي تي تي 2026 — سجل عائلتك وتابع أشجارها في واحة أرض البركة.</p></section><section><h2>تسجيل الدخول</h2><form id="login"><label>البريد الإلكتروني</label><input name="email" type="email" autocomplete="email" required><label>كلمة المرور</label><input name="password" type="password" autocomplete="current-password" minlength="8" required><button>تسجيل الدخول</button></form><h2>إنشاء حساب جديد</h2><form id="signup"><label>الاسم</label><input name="name" maxlength="80" required><label>البريد الإلكتروني</label><input name="email" type="email" autocomplete="email" required><label>كلمة المرور (8 أحرف على الأقل)</label><input name="password" type="password" autocomplete="new-password" minlength="8" required><button>إنشاء حساب</button></form><p id="notice" role="status" aria-live="polite"></p></section></main>`

3) داخل render() استبدل:
document.querySelector('#login')?.addEventListener('submit',sendOtp);document.querySelector('#verify')?.addEventListener('submit',verifyOtp);
بـ:
document.querySelector('#login')?.addEventListener('submit',signInEmail);document.querySelector('#signup')?.addEventListener('submit',signUpEmail);

4) احذف الدالتين sendOtp و verifyOtp فقط واستبدلهما بـ:
async function signInEmail(e){e.preventDefault();const email=e.target.elements.email.value.trim();const password=e.target.elements.password.value;const {error}=await db.auth.signInWithPassword({email,password});if(error)message('تعذر تسجيل الدخول: '+error.message,true);}
async function signUpEmail(e){e.preventDefault();const name=e.target.elements.name.value.trim();const email=e.target.elements.email.value.trim();const password=e.target.elements.password.value;const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:name}}});if(error)return message('تعذر إنشاء الحساب: '+error.message,true);message(data.session?'تم إنشاء الحساب وتسجيل الدخول':'تم إنشاء الحساب. تحقق من بريدك الإلكتروني إذا طُلب التأكيد.');}

ملاحظة: إذا كانت profiles تتطلب سجلاً مستقلاً، تأكد من وجود trigger آمن لإنشاء profile للمستخدم الجديد. لا تضع service_role في كود المتصفح. أعد تفعيل تأكيد البريد قبل إطلاق الخدمة للعامة.
