// Design system overview — rebuilt.
// 60 / 30 / 10 ratio: white surface · forest ink+accents · jade for moments of trust.
// Status: jade(success) · amber(warn/review) · rose(error).
// Two artboards: light-on-white and forest-panel variant — identical content, different bg.

const Swatch = ({ name, hex, fg = 'text-white', sub, ratio }) => (
  <div className="rounded-xl p-4 ring-1 ring-black/5 flex flex-col gap-3" style={{ background: hex }}>
    <div className={`${fg} flex items-baseline justify-between`}>
      <span className="font-display font-semibold text-[13px]">{name}</span>
      <span className="font-mono text-[10.5px] opacity-75 tracking-wide">{hex}</span>
    </div>
    <div className={`${fg} font-mono text-[10.5px] opacity-70 uppercase tracking-[0.14em] flex items-center justify-between`}>
      <span>{sub}</span>
      {ratio && <span className="font-bold">{ratio}</span>}
    </div>
  </div>
);

const TypeRow = ({ size, line, weight, label, sample, family = 'Inter Tight', tone }) => (
  <div className={`grid grid-cols-12 items-baseline py-4 border-b last:border-0 ${tone==='dark'?'border-cream-50/10':'border-forest-900/10'}`}>
    <div className="col-span-3 flex flex-col gap-1">
      <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${tone==='dark'?'text-cream-50/55':'text-ink-muted'}`}>{label}</div>
      <div className={`font-mono text-[11px] num ${tone==='dark'?'text-cream-50/60':'text-ink-soft'}`}>{size}/{line} · {weight} · {family}</div>
    </div>
    <div className={`col-span-9 ${tone==='dark'?'text-cream-50':'text-forest-900'}`} style={{ fontFamily: family, fontSize: size + 'px', lineHeight: line + 'px', fontWeight: weight, letterSpacing: size >= 32 ? '-0.02em' : (size >= 20 ? '-0.01em' : '0') }}>{sample}</div>
  </div>
);

const SystemBody = ({ tone = 'light' }) => {
  const dark = tone === 'dark';
  const bg = dark ? 'bg-forest-950' : 'bg-white';
  const text = dark ? 'text-cream-50' : 'text-forest-900';
  const muted = dark ? 'text-cream-50/60' : 'text-ink-muted';
  const soft = dark ? 'text-cream-50/75' : 'text-ink-soft';
  const cardBg = dark ? 'bg-cream-50/[0.04]' : 'bg-white';
  const cardRing = dark ? 'ring-cream-50/10' : 'ring-forest-900/10';
  const hair = dark ? 'border-cream-50/10' : 'border-forest-900/10';
  const sectionLabel = dark ? 'text-cream-50/50' : 'text-ink-muted';

  return (
    <div className={`w-[1440px] ${bg}`} style={{ minHeight: 1850 }}>
      <div className="px-16 py-14">

        {/* Header */}
        <div className="flex items-start justify-between gap-12 mb-14">
          <div>
            <Stamp className={dark?'!bg-cream-50/10 !text-cream-50 !ring-cream-50/15':''}>Design system · v0.2</Stamp>
            <h1 className={`font-display text-[64px] font-bold tracking-[-0.025em] ${text} mt-5 leading-[0.95]`}>
              60 · 30 · 10.<br/>
              <span className={dark?'text-cream-50/45':'text-forest-900/40'}>One discipline. Two surfaces.</span>
            </h1>
            <p className={`text-[15px] ${soft} mt-5 max-w-xl leading-relaxed`}>
              Sixty percent surface (white or forest). Thirty percent forest ink and structure. Ten percent jade, reserved for moments of trust — approvals, success, completion.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="seal" style={dark?{borderColor:'#10b981', color:'#10b981'}:{}}>Approved · Dr. A. Aleid</div>
            <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted}`}>tokens.css → R19 + Tailwind v4 + shadcn</div>
            {dark && <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-cream-50/45">Variant · dark surface</div>}
          </div>
        </div>

        {/* THE 60/30/10 RATIO BAR */}
        <section className="mb-14">
          <h2 className={`font-mono text-[11px] tracking-[0.18em] uppercase ${sectionLabel} mb-4`}>01 — The ratio</h2>
          <div className="flex h-20 rounded-2xl overflow-hidden ring-1 ring-black/5">
            <div className="flex-[60] bg-white text-forest-900 px-6 flex items-center justify-between border-r border-black/5">
              <div>
                <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">60 · surface</div>
                <div className="font-display font-bold text-[18px] tracking-tight">White · #FFFFFF</div>
              </div>
              <span className="font-display font-bold text-[42px] num text-forest-900/15">60%</span>
            </div>
            <div className="flex-[30] bg-forest-900 text-cream-50 px-6 flex items-center justify-between border-r border-black/5">
              <div>
                <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-cream-50/55">30 · ink & structure</div>
                <div className="font-display font-bold text-[18px] tracking-tight">Forest · #064E3B</div>
              </div>
              <span className="font-display font-bold text-[42px] num text-cream-50/15">30%</span>
            </div>
            <div className="flex-[10] bg-jade-500 text-white px-6 flex items-center justify-between">
              <div>
                <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-white/70">10 · trust accent</div>
                <div className="font-display font-bold text-[18px] tracking-tight">Jade · #10B981</div>
              </div>
              <span className="font-display font-bold text-[36px] num text-white/20">10%</span>
            </div>
          </div>
          <p className={`text-[12.5px] ${soft} mt-3 max-w-2xl`}>
            <span className={`font-semibold ${text}`}>Rule.</span> Jade never appears in primary CTAs, navigation, or decorative gradients. It earns its place only on approval certificates, completed steps, "AI passed" states, and verified-signature marks.
          </p>
        </section>

        {/* SWATCHES */}
        <section className="mb-14">
          <h2 className={`font-mono text-[11px] tracking-[0.18em] uppercase ${sectionLabel} mb-4`}>02 — Tokens</h2>

          <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-2`}>Core · 3 tokens, no more</div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Swatch name="Surface" hex="#FFFFFF" fg="text-forest-900" sub="--bg · primary" ratio="60%"/>
            <Swatch name="Forest" hex="#064E3B" sub="--ink · primary" ratio="30%"/>
            <Swatch name="Jade" hex="#10B981" sub="--accent · success" ratio="10%"/>
          </div>

          <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-2`}>Neutral support · ink scale on surface</div>
          <div className="grid grid-cols-5 gap-3 mb-6">
            <Swatch name="Ink" hex="#1A1F1C" sub="body text"/>
            <Swatch name="Ink soft" hex="#3A4540" sub="secondary"/>
            <Swatch name="Ink muted" hex="#6B7670" sub="labels"/>
            <Swatch name="Ink faint" hex="#9AA39E" sub="placeholders"/>
            <Swatch name="Hairline" hex="#EEEDEA" fg="text-forest-900" sub="dividers · rings"/>
          </div>

          <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-2`}>Status · green · yellow · red</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl ring-1 ring-jade-200 overflow-hidden">
              <div className="bg-jade-500 text-white px-5 py-4 flex items-center justify-between">
                <span className="font-display font-bold text-[16px]">Success · Jade</span>
                <span className="font-mono text-[11px] opacity-80">#10B981</span>
              </div>
              <div className="bg-jade-50 px-5 py-3 text-jade-900 text-[12.5px] flex items-center gap-2">
                <span className="w-3.5 h-3.5"><I.check/></span> Approved · AI passed · certificate issued
              </div>
            </div>
            <div className="rounded-xl ring-1 ring-amber-200 overflow-hidden">
              <div className="bg-amber-500 text-amber-950 px-5 py-4 flex items-center justify-between">
                <span className="font-display font-bold text-[16px]">Warning · Amber</span>
                <span className="font-mono text-[11px] opacity-80">#F59E0B</span>
              </div>
              <div className="bg-amber-50 px-5 py-3 text-amber-900 text-[12.5px] flex items-center gap-2">
                <span className="w-3.5 h-3.5"><I.alert/></span> Under review · pilot banner · expiring
              </div>
            </div>
            <div className="rounded-xl ring-1 ring-rose-200 overflow-hidden">
              <div className="bg-rose-600 text-white px-5 py-4 flex items-center justify-between">
                <span className="font-display font-bold text-[16px]">Error · Rose</span>
                <span className="font-mono text-[11px] opacity-80">#E11D48</span>
              </div>
              <div className="bg-rose-50 px-5 py-3 text-rose-800 text-[12.5px] flex items-center gap-2">
                <span className="w-3.5 h-3.5"><I.alert/></span> Changes requested · validation · rejected
              </div>
            </div>
          </div>
        </section>

        {/* TYPOGRAPHY */}
        <section className="mb-14">
          <h2 className={`font-mono text-[11px] tracking-[0.18em] uppercase ${sectionLabel} mb-4`}>03 — Type</h2>
          <div className={`${cardBg} ring-1 ${cardRing} rounded-2xl px-8 py-2`}>
            <TypeRow tone={tone} label="Display / D1" size={56} line={60} weight={700} sample="Approved in 24 hours."/>
            <TypeRow tone={tone} label="Display / D2" size={40} line={44} weight={700} sample="The committee meets you halfway."/>
            <TypeRow tone={tone} label="Heading / H1" size={28} line={34} weight={600} sample="Stage 1 · Research classification"/>
            <TypeRow tone={tone} label="Heading / H2" size={20} line={28} weight={600} sample="Principal investigator details" family="Inter"/>
            <TypeRow tone={tone} label="Body / B1" size={15} line={24} weight={400} sample="Provide a concise description of the population, intervention, and primary outcome." family="Inter"/>
            <TypeRow tone={tone} label="Body / B2" size={13} line={20} weight={400} sample="This question reflects the latest NBCE 2024 guidance and is required for review." family="Inter"/>
            <TypeRow tone={tone} label="Mono / Label" size={11} line={14} weight={500} sample="IRB · SA-2026-04188 · STAGE 1" family="IBM Plex Mono"/>
            <TypeRow tone={tone} label="Arabic display" size={36} line={48} weight={700} sample="الموافقة في غضون 24 ساعة" family="Noto Kufi Arabic"/>
          </div>
        </section>

        {/* ATOMS */}
        <section className="mb-14">
          <h2 className={`font-mono text-[11px] tracking-[0.18em] uppercase ${sectionLabel} mb-4`}>04 — Atoms</h2>
          <div className="grid grid-cols-12 gap-5">
            <div className={`col-span-4 ${cardBg} ring-1 ${cardRing} rounded-2xl p-6`}>
              <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-4`}>Buttons</div>
              <div className="flex flex-wrap gap-2 items-center">
                <Btn variant="primary">Submit application</Btn>
                <Btn variant="jade" icon={<I.check/>}>Approve</Btn>
                <Btn variant="secondary">Save draft</Btn>
                <Btn variant="outline">Cancel</Btn>
                <Btn variant="ghost" iconRight={<I.arrow/>}>Continue</Btn>
              </div>
              <div className="mt-5 flex gap-2">
                <Btn size="sm" variant="primary">Small</Btn>
                <Btn size="md" variant="primary">Default</Btn>
                <Btn size="lg" variant="primary">Large</Btn>
              </div>
            </div>

            <div className={`col-span-4 ${cardBg} ring-1 ${cardRing} rounded-2xl p-6`}>
              <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-4`}>Status badges</div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="draft"/>
                <StatusBadge status="ai-review"/>
                <StatusBadge status="submitted"/>
                <StatusBadge status="under-review"/>
                <StatusBadge status="changes"/>
                <StatusBadge status="approved"/>
              </div>
              <div className={`hair h-px my-5`}/>
              <div className="flex flex-wrap gap-2">
                <Stamp className={dark?'!bg-cream-50/10 !text-cream-50 !ring-cream-50/15':''}>NBCE aligned</Stamp>
                <Stamp className={dark?'!bg-cream-50/10 !text-cream-50 !ring-cream-50/15':''}>PDPL</Stamp>
                <Stamp className={dark?'!bg-cream-50/10 !text-cream-50 !ring-cream-50/15':''}>ICH-GCP</Stamp>
              </div>
            </div>

            <div className={`col-span-4 ${cardBg} ring-1 ${cardRing} rounded-2xl p-6`}>
              <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-4`}>Inputs</div>
              <label className={`block text-[12px] font-medium ${soft} mb-1.5`}>Study title</label>
              <input className="w-full h-10 px-3 rounded-lg ring-1 ring-forest-900/15 bg-white text-forest-900 text-[14px] focus:ring-2 focus:ring-forest-900 outline-none" defaultValue="Effect of low-dose statin on…" />
              <label className={`block text-[12px] font-medium ${soft} mt-4 mb-1.5`}>Population</label>
              <select className="w-full h-10 px-3 rounded-lg ring-1 ring-forest-900/15 bg-white text-forest-900 text-[14px]">
                <option>Adults · 18–65</option>
              </select>
              <div className={`mt-4 flex items-center gap-2 text-[12px] ${soft}`}>
                <input type="checkbox" defaultChecked className="accent-jade-500" />
                I confirm this study follows the Declaration of Helsinki.
              </div>
            </div>

            <div className={`col-span-6 ${cardBg} ring-1 ${cardRing} rounded-2xl p-6`}>
              <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-4`}>Stage progress</div>
              <StageProgress step={1} total={2} percent={64}/>
              <div className="hair h-px my-6"/>
              <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-3`}>Timeline</div>
              <ol className="space-y-3">
                {[
                  ['Draft started','Apr 18','done'],
                  ['Stage 1 · AI review','Apr 18','done'],
                  ['Stage 2 · AI review','Apr 19','active'],
                  ['Committee decision','—','pending'],
                  ['Certificate issued','—','pending'],
                ].map(([t,d,s],i)=>(
                  <li key={i} className="flex items-center gap-3 text-[13px]">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${s==='done'?'bg-jade-500 text-white':s==='active'?'bg-forest-900 text-cream-50':dark?'bg-cream-50/10 text-cream-50/40':'bg-cream-200 text-ink-faint'}`}>
                      {s==='done' ? <span className="w-3 h-3"><I.check/></span> : <span className="font-mono text-[10px]">{i+1}</span>}
                    </span>
                    <span className={`flex-1 ${s==='pending'?(dark?'text-cream-50/40':'text-ink-faint'):(dark?'text-cream-50':'text-ink')}`}>{t}</span>
                    <span className={`font-mono text-[11px] ${muted}`}>{d}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className={`col-span-6 ${cardBg} ring-1 ${cardRing} rounded-2xl p-0 overflow-hidden`}>
              <div className="p-6 pb-4">
                <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted}`}>AI review · sample</div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className={`font-display text-[44px] font-bold ${text} leading-none num`}>86<span className={dark?'text-cream-50/30 text-[24px]':'text-ink-faint text-[24px]'}>/100</span></div>
                    <div className={`text-[12.5px] ${soft} mt-1`}>NBCE alignment · strong</div>
                  </div>
                  <span className="seal" style={dark?{borderColor:'#10b981',color:'#10b981'}:{}}>Pass</span>
                </div>
              </div>
              <div className={`${dark?'bg-cream-50/[0.03]':'bg-white'} px-6 py-4 border-t ${hair}`}>
                <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-2`}>Fastest fix</div>
                <div className={`text-[13px] ${text} leading-relaxed`}>Add a paragraph on data anonymisation method (e.g. k-anonymity, k=5) under "Privacy safeguards" — addresses 1 of 2 remaining gaps.</div>
              </div>
            </div>
          </div>
        </section>

        {/* GEOMETRY */}
        <section>
          <h2 className={`font-mono text-[11px] tracking-[0.18em] uppercase ${sectionLabel} mb-4`}>05 — Geometry</h2>
          <div className={`${cardBg} ring-1 ${cardRing} rounded-2xl p-6`}>
            <div className="grid grid-cols-4 gap-8 text-[12.5px]">
              <div>
                <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-3`}>Radius</div>
                <ul className="space-y-2 num">
                  <li className={`flex justify-between ${soft}`}><span>--r-sm</span><span className="font-mono">6</span></li>
                  <li className={`flex justify-between ${soft}`}><span>--r-md</span><span className="font-mono">10</span></li>
                  <li className={`flex justify-between ${soft}`}><span>--r-lg</span><span className="font-mono">14</span></li>
                  <li className={`flex justify-between ${soft}`}><span>--r-xl</span><span className="font-mono">20</span></li>
                </ul>
              </div>
              <div>
                <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-3`}>Spacing scale</div>
                <ul className="space-y-2 num">
                  <li className={`flex justify-between ${soft}`}><span>2 / 4 / 8</span><span className="font-mono">micro</span></li>
                  <li className={`flex justify-between ${soft}`}><span>12 / 16 / 20</span><span className="font-mono">form</span></li>
                  <li className={`flex justify-between ${soft}`}><span>32 / 48 / 64</span><span className="font-mono">section</span></li>
                  <li className={`flex justify-between ${soft}`}><span>96 / 128</span><span className="font-mono">hero</span></li>
                </ul>
              </div>
              <div>
                <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-3`}>Shadow</div>
                <div className="space-y-3">
                  <div className="h-10 rounded-lg bg-white shadow-hair flex items-center px-3 text-[12px] text-forest-900">hair · ring</div>
                  <div className="h-10 rounded-lg bg-white shadow-soft flex items-center px-3 text-[12px] text-forest-900">soft · cards</div>
                  <div className="h-10 rounded-lg bg-white shadow-lift flex items-center px-3 text-[12px] text-forest-900">lift · modals</div>
                </div>
              </div>
              <div>
                <div className={`font-mono text-[10.5px] tracking-[0.14em] uppercase ${muted} mb-3`}>RTL</div>
                <div className={`${soft} leading-relaxed`}>Use logical properties: <code className={`font-mono ${dark?'bg-cream-50/10 text-cream-50':'bg-cream-200 text-forest-900'} px-1 rounded`}>ms-/me-/ps-/pe-</code>. Mirror chevrons, progress fill, and timeline. Don't mirror logos, charts, or English IRB numbers.</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const SystemArtboardLight = () => <SystemBody tone="light"/>;
const SystemArtboardDark = () => <SystemBody tone="dark"/>;

window.SystemArtboardLight = SystemArtboardLight;
window.SystemArtboardDark = SystemArtboardDark;
// Backwards compat
window.SystemArtboard = SystemArtboardLight;
