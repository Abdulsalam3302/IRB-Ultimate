// Apply Stage 1 — research classification + PI info + AI review panel.
// Long form broken into section cards. Sticky AI review panel on the right.

const FormField = ({ label, hint, required, children, span = 12 }) => (
  <div style={{ gridColumn: `span ${span} / span ${span}` }}>
    <label className="block text-[12.5px] font-medium text-forest-900 mb-1.5">
      {label} {required && <span className="text-rose-600">*</span>}
    </label>
    {children}
    {hint && <div className="text-[11.5px] text-ink-muted mt-1.5">{hint}</div>}
  </div>
);

const Input = (p) => <input {...p} className={`w-full h-10 px-3 rounded-lg ring-1 ring-forest-900/15 bg-white text-[14px] focus:ring-2 focus:ring-forest-900 outline-none ${p.className||''}`}/>;

const Stage1Artboard = () => (
  <div className="w-[1440px] bg-cream-100 min-h-[1700px]">
    <Navbar active="dashboard" authed/>

    {/* Sticky stage-progress bar */}
    <div className="sticky top-16 z-20 bg-cream-50/90 backdrop-blur border-b border-forest-900/10">
      <div className="max-w-[1280px] mx-auto px-6 h-14 flex items-center gap-6">
        <a className="text-[12.5px] text-ink-soft hover:text-forest-900 inline-flex items-center gap-2"><span className="w-4 h-4"><I.arrowL/></span> Back to dashboard</a>
        <div className="hair w-px h-5"/>
        <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">SA-2026-04201 · Stage 1</div>
        <div className="flex-1 max-w-md">
          <StageProgress step={1} total={2} percent={64}/>
        </div>
        <div className="ms-auto flex items-center gap-2 text-[11.5px] text-ink-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-jade-500"/>
          <span className="num">Saved · 12:48</span>
          <Btn size="sm" variant="outline">Save & exit</Btn>
        </div>
      </div>
    </div>

    <main className="max-w-[1280px] mx-auto px-6 py-10 grid grid-cols-12 gap-6">

      {/* Section nav rail */}
      <nav className="col-span-2 sticky self-start top-36 text-[12.5px]">
        <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-3">Sections</div>
        <ol className="space-y-1.5">
          {[
            ['Classification','done'],
            ['Principal investigator','done'],
            ['Co-investigators','active'],
            ['Study overview','idle'],
            ['Funding & conflicts','idle'],
            ['Declaration','idle'],
          ].map(([t,s],i)=>(
            <li key={i} className="flex items-center gap-2.5">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono ${
                s==='done'?'bg-jade-500 text-white':s==='active'?'bg-forest-900 text-cream-50':'bg-cream-200 text-ink-faint'}`}>
                {s==='done'? '✓' : i+1}
              </span>
              <span className={s==='active'?'text-forest-900 font-medium':'text-ink-soft'}>{t}</span>
            </li>
          ))}
        </ol>
        <div className="hair h-px my-5"/>
        <button className="text-[12px] text-forest-900 inline-flex items-center gap-2 font-medium">
          <span className="w-4 h-4"><I.doc/></span> Format · pre-fill template
        </button>
        <button className="block text-[12px] text-ink-soft mt-2">Export draft (PDF)</button>
      </nav>

      {/* Form column */}
      <div className="col-span-7 space-y-5">
        <div>
          <Stamp>Stage 1 of 2 · Foundational details</Stamp>
          <h1 className="font-display text-[36px] font-bold text-forest-900 tracking-[-0.025em] mt-3 leading-tight">Research classification & investigators.</h1>
          <p className="text-ink-soft text-[14.5px] mt-2 max-w-xl">The AI uses these answers to route your file to the right sub-committee and to pre-screen against NBCE 2024 categories.</p>
        </div>

        {/* SECTION CARD — classification */}
        <Card className="p-7">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">Section 1 · Classification</div>
              <h2 className="font-display text-[20px] font-semibold text-forest-900 mt-1">What kind of research is this?</h2>
            </div>
            <StatusBadge status="approved"/>
          </div>

          <div className="grid grid-cols-12 gap-4">
            <FormField label="Research type" required>
              <div className="grid grid-cols-3 gap-2">
                {['Clinical · interventional','Observational','Survey / qualitative','Secondary data','Lab / pre-clinical','Public health'].map((t,i)=>(
                  <label key={i} className={`flex items-start gap-2 p-3 rounded-lg ring-1 cursor-pointer transition ${i===0?'ring-forest-900 bg-forest-50/60':'ring-forest-900/10 hover:ring-forest-900/30'}`}>
                    <span className={`mt-0.5 w-4 h-4 rounded-full ring-1 flex items-center justify-center ${i===0?'ring-forest-900':'ring-forest-900/30'}`}>
                      {i===0 && <span className="w-2 h-2 rounded-full bg-forest-900"/>}
                    </span>
                    <span className="text-[13px] text-forest-900 leading-snug">{t}</span>
                  </label>
                ))}
              </div>
            </FormField>

            <FormField label="Risk category" hint="Auto-suggested from your answers. Reviewer may override." required span={6}>
              <Input defaultValue="Minimal risk · expedited" readOnly className="!bg-cream-100 font-medium" />
            </FormField>
            <FormField label="Population" required span={6}>
              <select className="w-full h-10 px-3 rounded-lg ring-1 ring-forest-900/15 bg-white text-[14px]">
                <option>Adults · 18–65 (non-vulnerable)</option>
                <option>Adults · ≥65 (older)</option>
                <option>Pediatric</option>
                <option>Pregnant</option>
                <option>Prisoners or institutionalised</option>
              </select>
            </FormField>
          </div>
        </Card>

        {/* SECTION CARD — PI */}
        <Card className="p-7">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">Section 2 · Principal investigator</div>
              <h2 className="font-display text-[20px] font-semibold text-forest-900 mt-1">PI details</h2>
            </div>
            <StatusBadge status="approved"/>
          </div>
          <div className="grid grid-cols-12 gap-4">
            <FormField label="Full name (English)" required span={6}><Input defaultValue="Dr. Layla Al-Harbi"/></FormField>
            <FormField label="الاسم بالعربية" required span={6}><Input defaultValue="د. ليلى الحربي" dir="rtl" className="font-arabic"/></FormField>
            <FormField label="ORCID" hint="We'll pull your latest CV automatically" span={4}><Input defaultValue="0000-0002-1825-0097" className="font-mono num"/></FormField>
            <FormField label="Institution" span={5}><Input defaultValue="King Faisal Specialist Hospital & Research Centre"/></FormField>
            <FormField label="Role" span={3}><Input defaultValue="Consultant · Cardiology"/></FormField>
            <FormField label="Institutional email" span={6}><Input defaultValue="l.alharbi@kfshrc.edu.sa" className="font-mono"/></FormField>
            <FormField label="Phone" span={3}><Input defaultValue="+966 50 123 4567" className="font-mono num"/></FormField>
            <FormField label="License no." span={3}><Input defaultValue="SCFHS-7421-09" className="font-mono"/></FormField>
          </div>
        </Card>

        {/* SECTION CARD — Co-Is (active section) */}
        <Card className="p-7 ring-2 ring-forest-900/30">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">Section 3 · Co-investigators</div>
              <h2 className="font-display text-[20px] font-semibold text-forest-900 mt-1">Add your team</h2>
              <p className="text-[13px] text-ink-soft mt-1">Include anyone who will recruit participants, take consent, or analyse identifiable data.</p>
            </div>
            <StatusBadge status="ai-review"/>
          </div>

          <ul className="divide-y divide-forest-900/10 ring-1 ring-forest-900/10 rounded-xl overflow-hidden">
            {[
              ['Dr. Sara Al-Mutairi','Co-PI · Endocrinology','sara@kfshrc.edu.sa','Confirmed'],
              ['Dr. Khaled Al-Anazi','Statistician · KAUST','k.alanazi@kaust.edu.sa','Invite sent'],
            ].map(([n,r,e,s],i)=>(
              <li key={i} className="grid grid-cols-12 gap-4 items-center px-4 py-3 bg-white">
                <div className="col-span-1"><div className="w-9 h-9 rounded-full placeholder ring-1 ring-forest-900/10"/></div>
                <div className="col-span-4">
                  <div className="text-[13.5px] font-medium text-forest-900">{n}</div>
                  <div className="text-[11.5px] text-ink-muted">{r}</div>
                </div>
                <div className="col-span-4 text-[12.5px] text-ink-soft font-mono truncate">{e}</div>
                <div className="col-span-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${s==='Confirmed'?'bg-jade-50 text-jade-700':'bg-cream-200 text-ink-soft'}`}>{s}</span>
                </div>
                <div className="col-span-1 text-end text-ink-muted">···</div>
              </li>
            ))}
          </ul>
          <button className="mt-4 w-full h-11 rounded-lg ring-1 ring-dashed ring-forest-900/25 text-forest-900 text-[13px] inline-flex items-center justify-center gap-2 hover:bg-cream-100">
            <span className="w-4 h-4"><I.plus/></span> Add a co-investigator
          </button>
        </Card>

        {/* Action bar */}
        <div className="flex items-center justify-between pt-3">
          <Btn variant="ghost" icon={<I.arrowL/>}>Previous section</Btn>
          <div className="flex items-center gap-2">
            <Btn variant="secondary" icon={<I.doc/>}>Format · pre-fill from this</Btn>
            <Btn variant="primary" iconRight={<I.arrow/>}>Continue to Stage 2</Btn>
          </div>
        </div>
      </div>

      {/* AI REVIEW PANEL — sticky right column */}
      <aside className="col-span-3 sticky self-start top-36 space-y-4">
        <Card className="p-0 overflow-hidden">
          {/* Score head */}
          <div className="p-5 pb-4 bg-gradient-to-b from-cream-50 to-white">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">AI review</div>
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-jade-700 bg-jade-50 px-1.5 py-0.5 rounded">live</span>
            </div>
            <div className="mt-4 flex items-end gap-4">
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" stroke="#e8e4d8" strokeWidth="3" fill="none"/>
                  <circle cx="18" cy="18" r="15.5" stroke="#10b981" strokeWidth="3" fill="none"
                    strokeDasharray={`${86/100*97.4} 97.4`} strokeLinecap="round"/>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-[28px] font-bold text-forest-900 num leading-none">86</span>
                  <span className="font-mono text-[9px] text-ink-muted tracking-wide">OF 100</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[13.5px] text-jade-700 font-semibold flex items-center gap-1.5"><span className="w-3.5 h-3.5"><I.check/></span> On track for approval</div>
                <div className="text-[12px] text-ink-soft mt-1.5 leading-snug">2 minor gaps. Estimated fix time <span className="font-mono num text-forest-900 font-semibold">4 min</span>.</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[['NBCE',92],['Helsinki',88],['Method',78]].map(([k,v])=>(
                <div key={k}>
                  <div className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-ink-muted">{k}</div>
                  <div className="font-display text-[16px] font-semibold text-forest-900 num">{v}</div>
                  <div className="h-1 mt-1 rounded-full bg-cream-200 overflow-hidden">
                    <div className="h-full bg-forest-700 rounded-full" style={{ width: v+'%' }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="border-t border-forest-900/10 p-5">
            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-3">Fastest fixes · 2</div>
            <ul className="space-y-3.5">
              {[
                {tag:'METHOD', txt:'Specify your randomisation method (block / stratified) under Section 4 · "Allocation".', fix:'+5 pts'},
                {tag:'PRIVACY', txt:'Add a one-line statement on data anonymisation (k-anonymity, k≥5) — required by PDPL Art. 9.', fix:'+3 pts'},
              ].map((r,i)=>(
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-[9px] tracking-[0.14em] uppercase bg-cream-200 text-forest-900 px-1.5 py-0.5 rounded mt-0.5 h-fit">{r.tag}</span>
                  <div className="flex-1">
                    <p className="text-[12.5px] text-forest-900 leading-relaxed">{r.txt}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <button className="text-[11.5px] text-jade-700 font-medium underline-offset-4 hover:underline">Apply suggested wording</button>
                      <span className="font-mono text-[10px] num text-ink-muted">{r.fix}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hair h-px my-5"/>

            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-3">Passed checks · 8</div>
            <ul className="space-y-1.5">
              {['Vulnerable population check','Consent language readability','PI credentials & license','Helsinki: risk-benefit ratio','PDPL: data residency','NBCE category alignment'].map((t,i)=>(
                <li key={i} className="flex items-center gap-2 text-[12px] text-ink-soft">
                  <span className="w-3.5 h-3.5 text-jade-600"><I.check/></span> {t}
                </li>
              ))}
              <li className="text-[11.5px] text-ink-muted">+ 2 more</li>
            </ul>
          </div>

          <div className="border-t border-forest-900/10 p-4 bg-cream-100/60">
            <Btn variant="jade" className="w-full" icon={<I.sparkle/>}>Re-run AI review</Btn>
            <div className="text-[10.5px] text-ink-muted mt-2 text-center font-mono">Powered by Claude · NBCE-2024 prompt v.18</div>
          </div>
        </Card>
      </aside>
    </main>
  </div>
);

window.Stage1Artboard = Stage1Artboard;
