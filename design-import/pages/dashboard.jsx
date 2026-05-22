// Dashboard — "command center" rather than a table of rows.
// My applications, stat cards, filters, an empty-state ghost, new-application CTA.

const StatCard = ({ label, value, sub, trend, accent }) => (
  <Card className="p-6 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">{label}</div>
      {trend && <span className={`text-[11px] font-mono num ${trend.startsWith('-')?'text-rose-600':'text-jade-700'}`}>{trend}</span>}
    </div>
    <div className="font-display text-[40px] font-bold text-forest-900 num leading-none tracking-[-0.02em]">{value}</div>
    <div className="text-[12.5px] text-ink-soft">{sub}</div>
    {accent && <div className="h-1 rounded-full" style={{ background:`linear-gradient(90deg, ${accent} ${(accent==='#10b981'?'72%':'52%')}, rgba(6,78,59,0.08) 0)`}}/>}
  </Card>
);

const AppRow = ({ id, title, stage, status, score, when, risk }) => (
  <li className="grid grid-cols-12 gap-4 items-center px-5 py-4 hover:bg-cream-100 transition-colors border-b border-forest-900/[0.06] last:border-b-0 cursor-pointer">
    <div className="col-span-5">
      <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-muted">{id}</div>
      <div className="text-forest-900 font-medium text-[14px] mt-0.5 truncate">{title}</div>
    </div>
    <div className="col-span-1 text-[12px] text-ink-soft num">Stage {stage}/2</div>
    <div className="col-span-2"><StatusBadge status={status}/></div>
    <div className="col-span-1 flex items-center gap-2">
      {score!=null ? (
        <>
          <div className="relative w-9 h-9">
            <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
              <circle cx="18" cy="18" r="15" stroke="#e8e4d8" strokeWidth="3" fill="none"/>
              <circle cx="18" cy="18" r="15" stroke={score>=80?'#10b981':score>=60?'#f59e0b':'#e11d48'} strokeWidth="3" fill="none"
                strokeDasharray={`${(score/100)*94.2} 94.2`} strokeLinecap="round"/>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] num text-forest-900">{score}</span>
          </div>
        </>
      ) : (<span className="text-ink-faint text-[12px]">—</span>)}
    </div>
    <div className="col-span-1 text-[12px] text-ink-soft">{risk}</div>
    <div className="col-span-1 text-[12px] text-ink-muted text-end font-mono num">{when}</div>
    <div className="col-span-1 text-end text-ink-muted"><span className="w-4 h-4 inline-block"><I.chev/></span></div>
  </li>
);

const DashboardArtboard = () => (
  <div className="w-[1440px] bg-cream-100 min-h-[1400px]">
    <Navbar active="dashboard" authed/>
    <main className="max-w-[1280px] mx-auto px-6 py-10">

      {/* Greeting + Primary CTA */}
      <div className="flex items-end justify-between gap-8 mb-9">
        <div>
          <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-ink-muted">Tuesday · 22 April 2026</div>
          <h1 className="font-display text-[44px] font-bold text-forest-900 mt-2 tracking-[-0.025em] leading-tight">
            Good morning, <span className="text-forest-900/55">Dr. Layla.</span>
          </h1>
          <p className="text-ink-soft text-[14.5px] mt-2 max-w-lg">You have <span className="text-forest-900 font-medium">1 application waiting for committee review</span> and a Stage 2 draft saved 3 hours ago.</p>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="outline" icon={<I.search/>}>Find application</Btn>
          <Btn variant="primary" size="lg" icon={<I.plus/>}>New application</Btn>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-9">
        <StatCard label="In progress" value="3" sub="2 drafts · 1 in review" trend="+1 this week" accent="#064e3b"/>
        <StatCard label="Approved · YTD" value="11" sub="of 12 submitted" trend="91.7%" accent="#10b981"/>
        <StatCard label="Avg. decision time" value="29h" sub="across last 6 studies" trend="-4h"/>
        <StatCard label="AI score · avg" value="84" sub="strong NBCE alignment" trend="+6 vs 2025"/>
      </div>

      {/* Two-column: applications + side panel */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-8">
          <Card className="overflow-hidden">
            {/* toolbar */}
            <div className="px-5 py-4 flex items-center gap-3 border-b border-forest-900/10">
              <h2 className="font-display text-[18px] font-semibold text-forest-900">My applications</h2>
              <div className="ms-auto flex items-center gap-2">
                <div className="flex h-9 ring-1 ring-forest-900/15 rounded-lg overflow-hidden font-mono text-[11px] tracking-wide">
                  {['All · 14','Drafts · 2','In review · 1','Approved · 11'].map((t,i)=>(
                    <button key={i} className={`px-3 ${i===0?'bg-forest-900 text-cream-50':'text-ink-soft hover:bg-cream-100'}`}>{t}</button>
                  ))}
                </div>
                <button className="h-9 w-9 rounded-lg ring-1 ring-forest-900/15 flex items-center justify-center text-ink-soft hover:bg-cream-100"><span className="w-4 h-4"><I.filter/></span></button>
              </div>
            </div>
            {/* table head */}
            <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-cream-100/60 border-b border-forest-900/[0.06] font-mono text-[10.5px] tracking-[0.16em] uppercase text-ink-muted">
              <div className="col-span-5">Study · IRB no.</div>
              <div className="col-span-1">Stage</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Score</div>
              <div className="col-span-1">Risk</div>
              <div className="col-span-1 text-end">Updated</div>
              <div className="col-span-1"></div>
            </div>
            <ul>
              <AppRow id="SA-2026-04188" title="Low-dose statin in pre-diabetic adults" stage="2" status="approved" score={91} risk="Min." when="Apr 22"/>
              <AppRow id="SA-2026-04201" title="Sleep apnea screening in cardiac rehab outpatients" stage="2" status="under-review" score={86} risk="Low" when="Apr 21"/>
              <AppRow id="SA-2026-04244" title="Mobile-app CBT for general anxiety · Arabic version" stage="2" status="ai-review" score={73} risk="Min." when="Apr 20"/>
              <AppRow id="SA-2026-04279" title="Genomic markers for early-onset MS in Saudi cohort" stage="1" status="changes" score={58} risk="Mod." when="Apr 18"/>
              <AppRow id="SA-2026-04302" title="Comparative effectiveness of two anti-hypertensives" stage="1" status="draft" score={null} risk="—" when="Apr 17"/>
              <AppRow id="SA-2026-04318" title="Pediatric pain assessment via wearable sensors" stage="1" status="draft" score={null} risk="—" when="Apr 16"/>
            </ul>
            <div className="px-5 py-3 flex items-center justify-between border-t border-forest-900/10 text-[12px] text-ink-muted">
              <span>Showing 6 of 14</span>
              <div className="flex items-center gap-2">
                <button className="px-2 py-1 rounded hover:bg-cream-100">Prev</button>
                <button className="px-2 py-1 rounded bg-cream-100 text-forest-900">1</button>
                <button className="px-2 py-1 rounded hover:bg-cream-100">2</button>
                <button className="px-2 py-1 rounded hover:bg-cream-100">3</button>
                <button className="px-2 py-1 rounded hover:bg-cream-100">Next</button>
              </div>
            </div>
          </Card>
        </div>

        {/* Side panel — Now / Next / Notices */}
        <aside className="col-span-4 space-y-5">
          {/* Continue card */}
          <Card className="p-5 relative overflow-hidden">
            <div className="absolute -right-6 -top-8 font-display font-bold text-[120px] text-forest-900/[0.04] tracking-tighter pointer-events-none">↗</div>
            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">Pick up where you left off</div>
            <div className="mt-3 font-medium text-forest-900 text-[14px] leading-snug">Stage 2 · Methodology · Sleep apnea screening study</div>
            <div className="mt-4">
              <StageProgress step={2} total={2} percent={42}/>
            </div>
            <div className="mt-4 text-[12px] text-ink-soft">Saved 3 hours ago. Next section — <span className="font-medium text-forest-900">Risk to participants</span>.</div>
            <Btn variant="primary" className="mt-5 w-full" iconRight={<I.arrow/>}>Continue draft</Btn>
          </Card>

          {/* AI suggestion */}
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg bg-jade-50 text-jade-700 flex items-center justify-center"><span className="w-5 h-5"><I.sparkle/></span></span>
              <div className="flex-1">
                <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">AI · Fastest fix</div>
                <p className="text-[13px] text-forest-900 mt-1.5 leading-relaxed">
                  On <span className="font-medium">SA-2026-04279</span>, the reviewer flagged consent-form length. The AI can re-draft a simpler Arabic version in 30 seconds.
                </p>
                <div className="flex gap-2 mt-3">
                  <Btn size="sm" variant="primary">Open</Btn>
                  <Btn size="sm" variant="ghost">Dismiss</Btn>
                </div>
              </div>
            </div>
          </Card>

          {/* Notices */}
          <Card className="p-5">
            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-3">Committee notices</div>
            <ul className="space-y-3 text-[12.5px]">
              {[
                ['New NBCE clarification','Vulnerable populations · Apr 20'],
                ['Maintenance window','Friday 02:00–03:00 AST'],
                ['Welcome','Dr. Aleid · pilot v2.4.1 changelog'],
              ].map(([t,d])=>(
                <li key={t} className="flex gap-3 items-start">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-forest-700"/>
                  <div>
                    <div className="text-forest-900 font-medium">{t}</div>
                    <div className="text-ink-muted">{d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Empty-state ghost (small) — illustrating the pattern */}
          <Card className="p-5 border border-dashed bg-cream-50 shadow-none ring-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg placeholder flex items-center justify-center"><span className="w-5 h-5 text-forest-900"><I.doc/></span></div>
              <div className="flex-1">
                <div className="text-[13.5px] text-forest-900 font-medium">No archived studies yet</div>
                <div className="text-[12px] text-ink-muted">Approved studies move to Archive after 12 months.</div>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {/* Footer band — quick links to other sections */}
      <div className="grid grid-cols-3 gap-4 mt-10">
        {[
          ['Resources','Templates · Format wizard · Helsinki digest', I.doc],
          ['Verify IRB','Public certificate lookup by number', I.shield],
          ['Talk to the committee','Office hours · Tue & Thu 10–12', I.chat],
        ].map(([t,d,Ic],i)=>(
          <a key={i} className="group bg-white rounded-2xl ring-1 ring-forest-900/10 shadow-soft p-5 flex items-center gap-4 hover:shadow-lift transition">
            <span className="w-11 h-11 rounded-lg bg-forest-50 text-forest-900 flex items-center justify-center"><span className="w-5 h-5"><Ic/></span></span>
            <div className="flex-1">
              <div className="font-display text-[16px] font-semibold text-forest-900">{t}</div>
              <div className="text-[12.5px] text-ink-soft">{d}</div>
            </div>
            <span className="w-5 h-5 text-ink-muted group-hover:text-forest-900 transition"><I.arrow/></span>
          </a>
        ))}
      </div>
    </main>
  </div>
);

window.DashboardArtboard = DashboardArtboard;
