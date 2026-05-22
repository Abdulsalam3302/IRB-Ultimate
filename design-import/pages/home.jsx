// Home — hero, stats, how-it-works, Vision 2030 alignment, footer.
// Distinctive Saudi healthcare landing — not generic SaaS.

const HomeArtboard = () => (
  <div className="w-[1440px] bg-cream-100">
    <Navbar active="home"/>
    <DemoBanner/>

    {/* HERO */}
    <section className="relative grain overflow-hidden" style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f6faf8 100%)' }}>
      <div className="absolute -right-40 -top-20 w-[640px] h-[640px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.10), transparent 60%)' }} />
      <div className="absolute -left-20 top-1/2 w-[440px] h-[440px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(6,78,59,0.06), transparent 60%)' }} />
      <div className="max-w-[1280px] mx-auto px-6 py-24 grid grid-cols-12 gap-10 items-center relative">
        <div className="col-span-7">
          <Stamp>NBCE-aligned · pilot live in Riyadh</Stamp>
          <h1 className="font-display text-[88px] font-bold tracking-[-0.03em] text-forest-900 leading-[0.95] mt-6">
            Ethical research,<br/>
            <span className="italic text-forest-700">approved</span> in
            <span className="inline-flex items-baseline ms-3">
              <span className="num">24–48</span>
              <span className="ml-1 text-forest-900/40 text-[44px] font-medium">hrs</span>
            </span>
          </h1>
          <p className="mt-7 text-[18px] text-ink-soft max-w-xl leading-[1.55]">
            IRB Ultimate is the first AI-assisted Institutional Review Board for Saudi researchers — pre-screens against NBCE guidelines, routes to committee, and issues a verifiable digital certificate.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Btn variant="primary" size="lg" iconRight={<I.arrow/>}>Start an application</Btn>
            <Btn variant="ghost" size="lg" icon={<I.shield/>}>Verify an IRB number</Btn>
          </div>
          <div className="mt-10 flex items-center gap-6 text-[12.5px] text-ink-muted">
            <div className="flex items-center gap-2"><span className="w-4 h-4 text-jade-600"><I.check/></span> Declaration of Helsinki</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 text-jade-600"><I.check/></span> ICH-GCP</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 text-jade-600"><I.check/></span> PDPL data handling</div>
          </div>
        </div>

        {/* Hero artwork — a "live certificate" being stamped */}
        <div className="col-span-5">
          <div className="relative">
            <div className="absolute -top-6 -left-4 z-10">
              <div className="seal" style={{ transform: 'rotate(-12deg)' }}>Stamped · Apr 22 · 09:14</div>
            </div>
            <div className="bg-white rounded-2xl shadow-lift ring-1 ring-forest-900/10 p-8 relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">Certificate of IRB approval</div>
                  <div className="font-display text-[22px] font-semibold text-forest-900 tracking-tight mt-1">SA-2026-04188</div>
                </div>
                <Logo size={36}/>
              </div>
              <div className="hair h-px my-5"/>
              <dl className="grid grid-cols-2 gap-y-3 text-[12.5px]">
                <dt className="text-ink-muted">Study</dt><dd className="text-ink font-medium">Low-dose statin in pre-diabetic adults</dd>
                <dt className="text-ink-muted">PI</dt><dd className="text-ink">Dr. Layla Al-Harbi · KFSHRC</dd>
                <dt className="text-ink-muted">Population</dt><dd className="text-ink num">n = 240 · adults 40–65</dd>
                <dt className="text-ink-muted">Decision</dt><dd className="text-jade-700 font-semibold flex items-center gap-1"><span className="w-3.5 h-3.5"><I.check/></span> Approved · expedited</dd>
                <dt className="text-ink-muted">Valid through</dt><dd className="text-ink num">Apr 22, 2027</dd>
              </dl>
              <div className="hair h-px my-5"/>
              <div className="flex items-end justify-between">
                <div>
                  <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-ink-muted mb-1">Approving authority</div>
                  <div className="text-forest-900 font-medium text-[13.5px]">Dr. Abdulsalam Aleid</div>
                  <div className="text-ink-muted text-[11.5px]">Platform Director · NBCE-aligned IRB</div>
                </div>
                <div className="text-right">
                  <svg width="86" height="36" viewBox="0 0 120 50" className="text-forest-900"><path d="M2 40 Q 20 5, 40 25 T 80 30 Q 100 12, 118 35" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                  <div className="font-mono text-[9.5px] text-ink-muted tracking-[0.14em] uppercase">Verified signature</div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-6 bg-forest-950 text-cream-50 px-4 py-3 rounded-xl shadow-lift flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-jade-500 text-white flex items-center justify-center"><span className="w-5 h-5"><I.check/></span></span>
              <div>
                <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-cream-50/60">Decision</div>
                <div className="font-semibold text-[14px]">Approved · 31 h 18 m</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* STAT BAND */}
    <section className="border-y border-forest-900/10 bg-cream-50">
      <div className="max-w-[1280px] mx-auto px-6 py-12 grid grid-cols-4 gap-8">
        {[
          ['Median time to decision','31 h','Across 412 applications in pilot'],
          ['Applications approved','94.3%','First-pass after AI pre-screen'],
          ['Active institutions','17','KSA universities & hospitals'],
          ['Average AI score','82/100','Stage 1 + Stage 2 combined'],
        ].map(([k,v,sub],i)=>(
          <div key={i} className="flex flex-col gap-2">
            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">{k}</div>
            <div className="font-display text-[44px] font-bold text-forest-900 num leading-none tracking-[-0.02em]">{v}</div>
            <div className="text-[12.5px] text-ink-soft">{sub}</div>
          </div>
        ))}
      </div>
    </section>

    {/* HOW IT WORKS — magazine-style */}
    <section className="max-w-[1280px] mx-auto px-6 py-24">
      <div className="grid grid-cols-12 gap-10 mb-12">
        <div className="col-span-4">
          <Stamp>The process</Stamp>
          <h2 className="font-display text-[44px] font-bold text-forest-900 mt-4 leading-[1.05] tracking-[-0.025em]">
            Four checkpoints.<br/>Zero paper.
          </h2>
        </div>
        <p className="col-span-7 col-start-6 text-[16px] text-ink-soft leading-[1.6] self-end">
          Every application moves through the same path — but the AI catches gaps before the committee sees your file, so reviewers spend their attention on substance, not on missing fields. Most studies clear all four checkpoints in a single working day.
        </p>
      </div>

      <ol className="grid grid-cols-4 gap-5">
        {[
          ['01','Draft','Pre-fill from your ORCID and prior submissions. Save anywhere, finish on any device.','15 min',I.doc],
          ['02','AI pre-screen','Two passes against NBCE rules and Helsinki principles. Get a score and a "fastest-fix" list.','instant',I.sparkle],
          ['03','Committee review','Routed to a sub-committee by risk category. Reviewers see your AI score alongside the file.','24–48 h',I.scale],
          ['04','Approval & stamp','Digital certificate signed by Dr. Aleid, publicly verifiable by IRB number.','seconds',I.check],
        ].map(([n,t,d,time,Ic],i)=>(
          <li key={i} className="bg-white rounded-2xl ring-1 ring-forest-900/10 shadow-soft p-6 flex flex-col gap-4 relative overflow-hidden">
            <div className="absolute -right-6 -top-8 font-display font-bold text-[120px] text-forest-900/[0.04] num tracking-tighter pointer-events-none">{n}</div>
            <span className="w-10 h-10 rounded-lg bg-forest-50 text-forest-900 flex items-center justify-center"><span className="w-5 h-5"><Ic/></span></span>
            <div>
              <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">Step {n}</div>
              <div className="font-display text-[22px] font-bold text-forest-900 mt-1 tracking-tight">{t}</div>
            </div>
            <p className="text-[13.5px] text-ink-soft leading-relaxed flex-1">{d}</p>
            <div className="hair h-px"/>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-ink-muted">Typical duration</span>
              <span className="font-mono num text-forest-900 font-semibold uppercase tracking-[0.14em] text-[11px]">{time}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>

    {/* VISION 2030 + TESTIMONIAL band */}
    <section className="bg-forest-950 text-cream-50 grain">
      <div className="max-w-[1280px] mx-auto px-6 py-24 grid grid-cols-12 gap-10">
        <div className="col-span-6">
          <Stamp className="!bg-cream-50/10 !text-cream-50 !ring-cream-50/15">Vision 2030 · Sector goal 12</Stamp>
          <h2 className="font-display text-[44px] font-bold leading-[1.05] tracking-[-0.025em] mt-4">
            Built for the Kingdom's <span className="text-jade-400">research decade.</span>
          </h2>
          <p className="text-cream-50/70 mt-6 text-[15.5px] leading-[1.65] max-w-md">
            Saudi Arabia plans to triple peer-reviewed research output by 2030. IRB Ultimate is the operating layer between researcher and regulator — built in the Kingdom, in both languages, on Kingdom-resident infrastructure.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-6">
            {[['Hosted','KSA · Riyadh region'],['Lang.','Arabic & English · full RTL'],['Data','PDPL · NDMO classified']].map(([k,v])=>(
              <div key={k}>
                <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-cream-50/40">{k}</div>
                <div className="text-cream-50 text-[14px] mt-1">{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-6">
          <figure className="bg-cream-50/[0.04] ring-1 ring-cream-50/10 rounded-2xl p-8">
            <svg width="32" height="24" viewBox="0 0 32 24" fill="none" className="text-jade-400"><path d="M0 24V12C0 5.4 4.5 0 12 0v4c-3.5 0-6.5 2.5-6.5 6h4.5v14H0zm17 0V12c0-6.6 4.5-12 12-12v4c-3.5 0-6.5 2.5-6.5 6H27v14H17z" fill="currentColor"/></svg>
            <p className="font-display text-[24px] leading-[1.4] text-cream-50 mt-5 tracking-[-0.01em]">
              We used to wait two months for a decision. With IRB Ultimate, our last six trials were approved before the committee's next meeting. The AI score told us what to fix before anyone read the file.
            </p>
            <figcaption className="mt-8 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full placeholder ring-1 ring-cream-50/15"/>
              <div>
                <div className="text-cream-50 font-medium text-[14px]">Prof. Mohammed Al-Otaibi</div>
                <div className="text-cream-50/55 text-[12.5px]">Chair, Clinical Research · King Saud University</div>
              </div>
            </figcaption>
          </figure>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              ['7 hospitals','KFSHRC · KAMC · KKUH …'],
              ['10 universities','KSU · KAU · IMSIU …'],
            ].map(([k,v])=>(
              <div key={k} className="bg-cream-50/[0.04] ring-1 ring-cream-50/10 rounded-xl px-5 py-4">
                <div className="font-display text-[20px] font-semibold">{k}</div>
                <div className="text-cream-50/55 text-[12px] mt-1">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* DUAL CTA */}
    <section className="max-w-[1280px] mx-auto px-6 py-24 grid grid-cols-2 gap-6">
      <div className="rounded-2xl p-10 bg-white ring-1 ring-forest-900/10 shadow-soft relative overflow-hidden">
        <span className="absolute top-4 right-4 seal">For researchers</span>
        <h3 className="font-display text-[34px] font-bold text-forest-900 leading-tight tracking-[-0.02em]">Begin a new IRB application.</h3>
        <p className="text-ink-soft mt-4 text-[14px] leading-relaxed">Sign in with your institutional account or ORCID. The AI walks you through Stage 1, Stage 2, and the format wizard — pre-filled, bilingual, exportable.</p>
        <Btn variant="primary" size="lg" iconRight={<I.arrow/>} className="mt-7">Start application</Btn>
      </div>
      <div className="rounded-2xl p-10 bg-forest-900 text-cream-50 relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 opacity-10"><Logo size={220} tone="cream"/></div>
        <span className="absolute top-4 right-4 px-3 py-1 rounded-full bg-cream-50/10 text-cream-50 text-[11px] font-mono uppercase tracking-[0.16em]">Public</span>
        <h3 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em]">Verify an IRB number.</h3>
        <p className="text-cream-50/70 mt-4 text-[14px] leading-relaxed">Anyone — journal editors, ethics officers, the public — can confirm a certificate is genuine in seconds.</p>
        <div className="mt-7 flex gap-2">
          <input className="h-12 px-4 rounded-lg bg-cream-50/5 ring-1 ring-cream-50/15 text-cream-50 placeholder-cream-50/40 flex-1 font-mono tracking-wider outline-none focus:ring-2 focus:ring-jade-500" placeholder="SA-2026-XXXXX" />
          <Btn variant="jade" size="lg">Verify</Btn>
        </div>
      </div>
    </section>

    <Footer/>
  </div>
);

window.HomeArtboard = HomeArtboard;
