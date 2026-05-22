// Format Wizard — Q&A page with pre-filled fields, language notice,
// Generate PDF/DOCX buttons, author stamp note.

const QA = ({ n, q, hint, children, pinned }) => (
  <div className="grid grid-cols-12 gap-6 py-7 border-b border-forest-900/10 last:border-b-0">
    <div className="col-span-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-forest-900 text-cream-50 flex items-center justify-center font-mono text-[10px] num">{n}</span>
        {pinned && <span className="text-[10px] font-mono tracking-[0.14em] uppercase text-forest-700 bg-forest-50 px-1.5 py-0.5 rounded">{pinned}</span>}
      </div>
      <div className="font-display text-[16px] font-semibold text-forest-900 mt-1 leading-snug">{q}</div>
      {hint && <div className="text-[11.5px] text-ink-muted leading-snug">{hint}</div>}
    </div>
    <div className="col-span-9">{children}</div>
  </div>
);

const WizardArtboard = () => (
  <div className="w-[1440px] bg-cream-100 min-h-[1700px]">
    <Navbar active="resources" authed/>

    <div className="max-w-[1180px] mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          <a className="text-[12.5px] text-ink-soft hover:text-forest-900 inline-flex items-center gap-2 mb-3"><span className="w-4 h-4"><I.arrowL/></span> Back to resources</a>
          <Stamp>Format wizard · Consent form · Adult clinical</Stamp>
          <h1 className="font-display text-[40px] font-bold text-forest-900 tracking-[-0.025em] mt-3 leading-tight">Generate a stamped consent form.</h1>
          <p className="text-ink-soft text-[15px] mt-2 max-w-2xl">Answers below are pre-filled from your application <span className="font-mono num">SA-2026-04201</span>. Edit anything, then export. The document is signed by Dr. Aleid in the language you're working in.</p>
        </div>
      </div>

      {/* Language notice */}
      <div className="mb-6 bg-forest-50 ring-1 ring-forest-900/10 rounded-xl p-4 flex items-center gap-4">
        <span className="w-9 h-9 rounded-lg bg-forest-900 text-cream-50 flex items-center justify-center"><span className="w-5 h-5"><I.globe/></span></span>
        <div className="flex-1">
          <div className="text-[13.5px] font-medium text-forest-900">Questions & export match your UI language.</div>
          <div className="text-[12.5px] text-ink-soft">You're working in <span className="font-medium">English</span>. Switch to <button className="underline underline-offset-2 hover:text-forest-900">العربية</button> to translate every question, answer, and exported document. IRB / NBCE / PDPL stay in English in either case.</div>
        </div>
        <Btn variant="outline" size="sm" icon={<I.globe/>}>Switch to Arabic</Btn>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-8 p-7">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-[20px] font-semibold text-forest-900">12 questions · 4 minutes</h2>
            <div className="flex items-center gap-3 text-[11.5px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-jade-500"/>Saved · 12:48</span>
              <span className="font-mono num">11/12</span>
            </div>
          </div>
          <div className="h-1 rounded-full bg-cream-200 mb-1">
            <div className="h-full bg-jade-500 rounded-full" style={{ width: '92%' }}/>
          </div>

          <QA n="1" q="What is the title of the study?" hint="Used as the consent-form headline." pinned="From app">
            <Input defaultValue="Effect of low-dose statin therapy on cardiovascular markers in pre-diabetic Saudi adults"/>
          </QA>
          <QA n="2" q="Who is the principal investigator?" hint="Name + role + institution, shown on the cover page." pinned="From app">
            <Input defaultValue="Dr. Layla Al-Harbi · Consultant Cardiology · King Faisal Specialist Hospital & Research Centre"/>
          </QA>
          <QA n="3" q="Why is this study being done?" hint="2–3 sentences, plain language. Aim for a 9th-grade reading level.">
            <textarea defaultValue="We are studying whether a low daily dose of a common cholesterol medication (a statin) can lower the risk of heart problems in adults whose blood sugar is slightly higher than normal. We want to find out if this is a safe and helpful option before doctors recommend it widely." rows="3" className="w-full p-3 rounded-lg ring-1 ring-forest-900/15 bg-white text-[14px] focus:ring-2 focus:ring-forest-900 outline-none resize-none"/>
            <div className="flex items-center justify-between mt-2">
              <button className="text-[11.5px] inline-flex items-center gap-1.5 text-forest-900 font-medium"><span className="w-3.5 h-3.5"><I.sparkle/></span> Simplify with AI · 9th grade</button>
              <span className="font-mono num text-[11px] text-ink-muted">204 / 400 chars · grade 9.4</span>
            </div>
          </QA>
          <QA n="4" q="Who can take part?" pinned="From app">
            <div className="grid grid-cols-2 gap-3">
              <Input defaultValue="Adults aged 40 to 65"/>
              <Input defaultValue="HbA1c between 5.7% and 6.4%"/>
              <Input defaultValue="No prior cardiovascular event"/>
              <Input defaultValue="Not pregnant or breastfeeding"/>
            </div>
            <button className="mt-2 text-[12px] text-forest-900 inline-flex items-center gap-1.5 font-medium"><span className="w-3.5 h-3.5"><I.plus/></span> Add another criterion</button>
          </QA>
          <QA n="5" q="What will participants be asked to do?">
            <textarea defaultValue="You will take one tablet by mouth each evening for 24 weeks. You'll come in for four short visits: a screening visit, then visits at week 4, week 12, and week 24. Each visit lasts about 60 minutes and includes a blood draw and a brief questionnaire." rows="3" className="w-full p-3 rounded-lg ring-1 ring-forest-900/15 bg-white text-[14px] focus:ring-2 focus:ring-forest-900 outline-none resize-none"/>
          </QA>
          <QA n="6" q="What are the possible risks?">
            <textarea defaultValue="Muscle soreness, fatigue, and stomach upset are the most common side effects of statins, usually mild. Rarely, statins can cause liver irritation — we check liver tests at every visit. A blood draw may cause mild bruising at the needle site." rows="3" className="w-full p-3 rounded-lg ring-1 ring-forest-900/15 bg-white text-[14px] focus:ring-2 focus:ring-forest-900 outline-none resize-none"/>
          </QA>
          <QA n="7" q="How will their privacy be protected?" pinned="From app">
            <div className="ring-1 ring-forest-900/15 rounded-lg bg-cream-100/50 p-4 text-[13px] text-forest-900 leading-relaxed">
              All identifiable information is replaced with a study code on entry. Original consent forms are stored in a locked cabinet at KFSHRC. Electronic data are stored on KSA-resident servers, encrypted at rest, with access limited to the named research team. We apply k-anonymity (k≥5) before any data leaves the study.
            </div>
          </QA>
          <div className="text-center text-[11.5px] text-ink-muted py-4 font-mono tracking-[0.14em] uppercase">5 more · scroll to continue</div>
        </Card>

        {/* Side — preview & export */}
        <aside className="col-span-4 space-y-4 sticky self-start top-24">
          {/* Live preview */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between border-b border-forest-900/10">
              <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">Live preview</div>
              <div className="flex items-center gap-1">
                <button className="font-mono text-[10.5px] uppercase tracking-wide px-2 py-1 rounded bg-forest-900 text-cream-50">EN</button>
                <button className="font-mono text-[10.5px] uppercase tracking-wide px-2 py-1 rounded text-ink-soft">AR</button>
              </div>
            </div>
            <div className="bg-cream-100/40 p-5">
              <div className="bg-white rounded-md ring-1 ring-forest-900/10 shadow-soft aspect-[8.5/11] p-5 relative overflow-hidden text-[6.5px] leading-snug text-ink">
                <div className="flex items-start justify-between">
                  <Logo size={14}/>
                  <div className="seal" style={{ transform:'rotate(-6deg)', padding:'3px 5px', fontSize:'5px', letterSpacing:'0.14em' }}>Aleid · stamped</div>
                </div>
                <div className="font-mono text-[5px] tracking-[0.14em] uppercase text-ink-muted mt-3">Participant consent form · v1.0</div>
                <div className="font-display text-[10px] font-bold text-forest-900 mt-1 leading-tight">Effect of low-dose statin therapy on cardiovascular markers in pre-diabetic Saudi adults</div>
                <div className="hair h-px my-2"/>
                <div><span className="text-ink-muted">Principal investigator · </span>Dr. Layla Al-Harbi, KFSHRC</div>
                <div><span className="text-ink-muted">IRB · </span><span className="font-mono">SA-2026-04201</span></div>
                <div className="mt-2 font-semibold text-forest-900">Why are we doing this study?</div>
                <p className="text-[5.5px] text-ink-soft mt-0.5 leading-snug">We are studying whether a low daily dose of a common cholesterol medication can lower the risk of heart problems in adults whose blood sugar is slightly higher than normal…</p>
                <div className="mt-2 font-semibold text-forest-900">Who can take part?</div>
                <ul className="list-disc list-inside text-[5.5px] text-ink-soft leading-snug">
                  <li>Adults aged 40–65</li>
                  <li>HbA1c between 5.7% and 6.4%</li>
                  <li>No prior cardiovascular event</li>
                </ul>
                <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
                  <div className="text-[5px] text-ink-muted">Page 1 of 4</div>
                  <div className="text-end">
                    <svg width="40" height="14" viewBox="0 0 120 50" className="text-forest-900"><path d="M2 40 Q 20 5, 40 25 T 80 30 Q 100 12, 118 35" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"/></svg>
                    <div className="text-[5px] text-ink-muted">Dr. A. Aleid</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Stamp / signature note */}
          <Card className="p-4 flex items-center gap-3">
            <div className="seal" style={{ transform:'rotate(-6deg)' }}>Aleid · stamped</div>
            <div className="text-[12px] text-ink-soft leading-snug">Every exported document carries Dr. Aleid's authorised digital stamp and a QR linking to <span className="font-mono text-forest-900">/verify</span>.</div>
          </Card>

          {/* Export */}
          <Card className="p-5">
            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-3">Generate document</div>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="primary" icon={<I.download/>}>PDF · A4</Btn>
              <Btn variant="secondary" icon={<I.download/>}>DOCX</Btn>
            </div>
            <div className="mt-4 hair h-px"/>
            <ul className="mt-4 space-y-1.5 text-[12px] text-ink-soft">
              <li className="flex items-center gap-2"><span className="w-3.5 h-3.5 text-jade-600"><I.check/></span> Embedded IRB QR code</li>
              <li className="flex items-center gap-2"><span className="w-3.5 h-3.5 text-jade-600"><I.check/></span> Bilingual cover page (if AR)</li>
              <li className="flex items-center gap-2"><span className="w-3.5 h-3.5 text-jade-600"><I.check/></span> Tracked-change history</li>
            </ul>
          </Card>

          <button className="w-full text-[12px] text-ink-soft hover:text-forest-900 py-2">Reset answers to draft from application</button>
        </aside>
      </div>
    </div>
  </div>
);

window.WizardArtboard = WizardArtboard;
