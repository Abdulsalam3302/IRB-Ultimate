// Arabic / RTL variant — mirrors the dashboard + a snippet of stage 1.
// Demonstrates RTL mirroring: nav, progress fill direction, chevrons, table layout.
// IRB / NBCE / PDPL / ORCID stay in English.

const ArabicArtboard = () => (
  <div dir="rtl" lang="ar" className="w-[1440px] bg-cream-100 min-h-[1500px] font-arabic">
    {/* Mirrored navbar */}
    <header className="glass sticky top-0 z-30 border-b border-forest-900/10">
      <div className="max-w-[1280px] mx-auto h-16 px-6 flex items-center gap-8" dir="rtl">
        <Logo />
        <nav className="hidden md:flex items-center gap-1 text-[14px] text-ink-soft">
          {[['الرئيسية','home'],['لوحة التحكم','active'],['المصادر','res'],['تحقق من IRB','ver'],['الدعم','sup']].map(([v,k])=>(
            <a key={k} className={`px-3 py-1.5 rounded-md hover:bg-cream-200/70 transition ${k==='active'?'text-forest-900 font-semibold':''}`}>{v}</a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <button className="h-9 px-2.5 rounded-md hover:bg-cream-200/70 text-ink-soft flex items-center gap-1.5 text-[12.5px] font-medium font-sans">
            <span className="w-4 h-4"><I.globe/></span> EN
          </button>
          <button className="h-9 w-9 rounded-md hover:bg-cream-200/70 text-ink-soft flex items-center justify-center"><span className="w-4 h-4"><I.sun/></span></button>
          <div className="ms-1 flex items-center gap-2 ps-2 border-s border-forest-900/10">
            <div className="h-8 w-8 rounded-full bg-forest-900 text-cream-50 font-mono text-[11px] flex items-center justify-center">LH</div>
          </div>
        </div>
      </div>
    </header>

    <main className="max-w-[1280px] mx-auto px-6 py-10">
      {/* Greeting */}
      <div className="flex items-end justify-between gap-8 mb-9">
        <div>
          <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-ink-muted">الثلاثاء · 22 أبريل 2026</div>
          <h1 className="font-display text-[44px] font-bold text-forest-900 mt-2 leading-tight" style={{ fontFamily:'"Noto Kufi Arabic"' }}>
            صباح الخير، <span className="text-forest-900/55">د. ليلى.</span>
          </h1>
          <p className="text-ink-soft text-[14.5px] mt-2 max-w-xl leading-loose">
            لديك <span className="text-forest-900 font-medium">طلب واحد بانتظار مراجعة اللجنة</span> ومسودة المرحلة الثانية تم حفظها قبل 3 ساعات.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="outline" icon={<I.search/>}>بحث</Btn>
          <Btn variant="primary" size="lg" icon={<I.plus/>}>طلب جديد</Btn>
        </div>
      </div>

      {/* Stat cards — Arabic numerals natural; tabular */}
      <div className="grid grid-cols-4 gap-4 mb-9">
        {[
          ['قيد التنفيذ','٣','مسودتان · واحدة قيد المراجعة'],
          ['موافق عليها · للسنة','١١','من ١٢ مقدمة'],
          ['متوسط وقت القرار','٢٩ س','آخر ست دراسات'],
          ['متوسط درجة AI','٨٤','توافق قوي مع NBCE'],
        ].map(([k,v,sub],i)=>(
          <Card key={i} className="p-6 flex flex-col gap-2">
            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted font-sans">{k}</div>
            <div className="font-display text-[40px] font-bold text-forest-900 num leading-none">{v}</div>
            <div className="text-[12.5px] text-ink-soft">{sub}</div>
          </Card>
        ))}
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-8">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3 border-b border-forest-900/10">
              <h2 className="font-display text-[18px] font-semibold text-forest-900">طلباتي</h2>
              <div className="ms-auto flex items-center gap-2">
                <div className="flex h-9 ring-1 ring-forest-900/15 rounded-lg overflow-hidden text-[12px]">
                  {['الكل · ١٤','مسودات · ٢','قيد المراجعة · ١','موافق عليها · ١١'].map((t,i)=>(
                    <button key={i} className={`px-3 ${i===0?'bg-forest-900 text-cream-50':'text-ink-soft hover:bg-cream-100'}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-cream-100/60 border-b border-forest-900/[0.06] text-[11px] text-ink-muted">
              <div className="col-span-5">الدراسة · رقم IRB</div>
              <div className="col-span-1">المرحلة</div>
              <div className="col-span-2">الحالة</div>
              <div className="col-span-1">الدرجة</div>
              <div className="col-span-1">الخطر</div>
              <div className="col-span-2 text-start">آخر تحديث</div>
            </div>
            <ul>
              {[
                ['SA-2026-04188','تأثير الجرعة المنخفضة من الستاتين على مرضى ما قبل السكري','٢','approved',91,'منخفض','٢٢ أبر'],
                ['SA-2026-04201','فحص انقطاع التنفس النومي لمرضى التأهيل القلبي','٢','under-review',86,'متوسط','٢١ أبر'],
                ['SA-2026-04244','تطبيق CBT للقلق العام · نسخة عربية','٢','ai-review',73,'منخفض','٢٠ أبر'],
                ['SA-2026-04279','واسمات جينية لتصلب اللويحات المتعدد · كوهورت سعودي','١','changes',58,'متوسط','١٨ أبر'],
                ['SA-2026-04302','فعالية مقارنة لخافضين للضغط','١','draft',null,'—','١٧ أبر'],
              ].map(([id,t,s,st,score,risk,when],i)=>(
                <li key={i} className="grid grid-cols-12 gap-4 items-center px-5 py-4 hover:bg-cream-100 transition-colors border-b border-forest-900/[0.06] last:border-b-0 cursor-pointer">
                  <div className="col-span-5">
                    <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-muted font-sans">{id}</div>
                    <div className="text-forest-900 font-medium text-[14px] mt-0.5 truncate">{t}</div>
                  </div>
                  <div className="col-span-1 text-[12px] text-ink-soft">مرحلة {s}/٢</div>
                  <div className="col-span-2">
                    <StatusBadge status={st}/>
                  </div>
                  <div className="col-span-1">
                    {score!=null ? (
                      <div className="relative w-9 h-9">
                        <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
                          <circle cx="18" cy="18" r="15" stroke="#e8e4d8" strokeWidth="3" fill="none"/>
                          <circle cx="18" cy="18" r="15" stroke={score>=80?'#10b981':score>=60?'#f59e0b':'#e11d48'} strokeWidth="3" fill="none"
                            strokeDasharray={`${(score/100)*94.2} 94.2`} strokeLinecap="round"/>
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] num text-forest-900">{score}</span>
                      </div>
                    ) : (<span className="text-ink-faint text-[12px]">—</span>)}
                  </div>
                  <div className="col-span-1 text-[12px] text-ink-soft">{risk}</div>
                  <div className="col-span-2 text-[12px] text-ink-muted text-start font-mono">{when}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className="col-span-4 space-y-5">
          {/* Continue */}
          <Card className="p-5 relative overflow-hidden">
            <div className="absolute -left-6 -top-8 font-display font-bold text-[120px] text-forest-900/[0.04] tracking-tighter pointer-events-none">↖</div>
            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted font-sans">تابع من حيث توقفت</div>
            <div className="mt-3 font-medium text-forest-900 text-[14px] leading-loose">المرحلة ٢ · المنهجية · دراسة انقطاع التنفس النومي</div>
            <div className="mt-4 flex items-center gap-4">
              <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-muted font-sans">مرحلة ٢/٢</div>
              <div className="flex-1 h-1.5 rounded-full bg-cream-200 overflow-hidden" dir="rtl">
                <div className="h-full bg-jade-500 rounded-full" style={{ width: '42%' }} />
              </div>
              <div className="font-mono num text-[11px] tracking-[0.14em] uppercase text-forest-900 font-sans">٤٢٪</div>
            </div>
            <div className="mt-4 text-[12px] text-ink-soft leading-loose">القسم التالي — <span className="font-medium text-forest-900">المخاطر على المشاركين</span>.</div>
            <Btn variant="primary" className="mt-5 w-full" iconRight={<I.arrowL/>}>متابعة المسودة</Btn>
          </Card>

          {/* AI panel mini */}
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg bg-jade-50 text-jade-700 flex items-center justify-center"><span className="w-5 h-5"><I.sparkle/></span></span>
              <div className="flex-1">
                <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted font-sans">AI · أسرع إصلاح</div>
                <p className="text-[13px] text-forest-900 mt-1.5 leading-loose">
                  في الطلب <span className="font-mono">SA-2026-04279</span>، أشار المراجع لطول استمارة الموافقة. يمكن للذكاء الاصطناعي صياغة نسخة عربية مبسطة في ٣٠ ثانية.
                </p>
                <div className="flex gap-2 mt-3">
                  <Btn size="sm" variant="primary">فتح</Btn>
                  <Btn size="sm" variant="ghost">رفض</Btn>
                </div>
              </div>
            </div>
          </Card>

          {/* RTL Notes badge */}
          <Card className="p-5 bg-forest-50/60 ring-forest-900/10">
            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted font-sans mb-2">ملاحظات الواجهة بالعربية</div>
            <ul className="space-y-2 text-[12.5px] text-ink-soft leading-loose">
              <li className="flex gap-2"><span className="text-forest-700">•</span> الخصائص المنطقية فقط: <code className="font-mono bg-cream-200 px-1 rounded text-[11px]">ms-/me-/ps-/pe-</code></li>
              <li className="flex gap-2"><span className="text-forest-700">•</span> IRB · NBCE · PDPL · ORCID تبقى بالإنجليزية</li>
              <li className="flex gap-2"><span className="text-forest-700">•</span> الأرقام بصيغة عربية في المحتوى، بصيغة لاتينية في رموز النظام</li>
              <li className="flex gap-2"><span className="text-forest-700">•</span> اتجاه شريط التقدم وعلامات الشيفرون يُعكس آليًا</li>
            </ul>
          </Card>
        </aside>
      </div>
    </main>
  </div>
);

window.ArabicArtboard = ArabicArtboard;
