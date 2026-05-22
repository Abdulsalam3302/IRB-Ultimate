// Resources — template cards with TWO clear sections:
//   A) blank PDF/DOCX download
//   B) pre-filled Format wizard button
// Solves pain point: "blank vs pre-filled not visually distinct enough".

const TemplateCard = ({ id, title, desc, refTag, audience, prefill, icon: Ic }) => (
  <Card className="p-0 overflow-hidden flex flex-col">
    {/* Header */}
    <div className="p-6 pb-5">
      <div className="flex items-start justify-between gap-3">
        <span className="w-11 h-11 rounded-xl bg-forest-50 text-forest-900 flex items-center justify-center"><span className="w-5 h-5"><Ic/></span></span>
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted">{id}</span>
      </div>
      <h3 className="font-display text-[20px] font-bold text-forest-900 mt-4 leading-tight tracking-tight">{title}</h3>
      <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">{desc}</p>
      <div className="mt-4 flex flex-wrap gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.14em]">
        <span className="px-1.5 py-0.5 rounded bg-cream-200 text-forest-900">{refTag}</span>
        <span className="px-1.5 py-0.5 rounded bg-cream-200 text-ink-soft">{audience}</span>
      </div>
    </div>

    {/* Two-route footer — the distinguishing piece */}
    <div className="mt-auto grid grid-cols-2 border-t border-forest-900/10">
      {/* Blank download */}
      <div className="p-5 bg-cream-50/60 border-e border-forest-900/10">
        <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted">A · Blank template</div>
        <div className="text-[12.5px] text-forest-900 font-medium mt-1.5 leading-snug">Empty form · fill on paper or in Word.</div>
        <div className="mt-3 flex gap-1.5">
          <button className="flex-1 h-9 rounded-md ring-1 ring-forest-900/15 bg-white text-forest-900 text-[12px] font-medium hover:bg-cream-100 inline-flex items-center justify-center gap-1.5">
            <span className="w-3.5 h-3.5"><I.download/></span> PDF
          </button>
          <button className="flex-1 h-9 rounded-md ring-1 ring-forest-900/15 bg-white text-forest-900 text-[12px] font-medium hover:bg-cream-100 inline-flex items-center justify-center gap-1.5">
            <span className="w-3.5 h-3.5"><I.download/></span> DOCX
          </button>
        </div>
        <div className="mt-3 flex items-center gap-1 text-[10.5px] text-ink-muted font-mono uppercase tracking-[0.14em]">
          <span>EN</span><span>·</span><span>AR</span>
        </div>
      </div>

      {/* Pre-filled wizard */}
      <div className="p-5 bg-forest-900 text-cream-50 relative overflow-hidden">
        <div className="absolute -right-6 -top-8 opacity-10"><span className="block w-24 h-24"><Logo size={96} tone="cream"/></span></div>
        <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-cream-50/55">B · Format wizard</div>
        <div className="text-[12.5px] font-medium mt-1.5 leading-snug">Pre-filled from {prefill}. Q&amp;A → stamped export.</div>
        <button className="mt-3 w-full h-9 rounded-md bg-jade-500 hover:bg-jade-600 text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5">
          <span className="w-3.5 h-3.5"><I.sparkle/></span> Format · open wizard
        </button>
        <div className="mt-3 flex items-center gap-1 text-[10.5px] text-cream-50/60 font-mono uppercase tracking-[0.14em]">
          <span className="inline-flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-jade-400"/> stamped</span><span>·</span><span>signed by Dr. Aleid</span>
        </div>
      </div>
    </div>
  </Card>
);

const ResourcesArtboard = () => (
  <div className="w-[1440px] bg-cream-100 min-h-[1500px]">
    <Navbar active="resources" authed/>

    <div className="max-w-[1280px] mx-auto px-6 py-10">
      {/* Header */}
      <div className="grid grid-cols-12 gap-6 mb-10">
        <div className="col-span-7">
          <Stamp>Resources · v2.4</Stamp>
          <h1 className="font-display text-[48px] font-bold text-forest-900 tracking-[-0.025em] mt-3 leading-[1.05]">
            Every template, two ways.
          </h1>
          <p className="text-ink-soft text-[15.5px] mt-3 max-w-xl leading-relaxed">
            Download a blank form to fill in by hand — or run the format wizard and we'll pre-fill it from your application, then stamp it with Dr. Aleid's authorised signature.
          </p>
        </div>
        <Card className="col-span-5 p-6 bg-forest-50/60 ring-forest-900/10">
          <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-3">How do I choose?</div>
          <div className="grid grid-cols-2 gap-4 text-[12.5px]">
            <div>
              <div className="font-medium text-forest-900 mb-1">A · Blank</div>
              <div className="text-ink-soft leading-snug">For external use, paper records, or if you don't have an application yet.</div>
            </div>
            <div>
              <div className="font-medium text-forest-900 mb-1">B · Pre-filled</div>
              <div className="text-ink-soft leading-snug">For submission-ready, stamped output linked to your IRB number.</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex h-10 ring-1 ring-forest-900/15 rounded-lg overflow-hidden font-mono text-[11px] tracking-wide bg-white">
          {['All · 18','Consent','Protocol','Methodology','Data plans','Reporting'].map((t,i)=>(
            <button key={i} className={`px-3.5 ${i===0?'bg-forest-900 text-cream-50':'text-ink-soft hover:bg-cream-100'}`}>{t}</button>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <div className="relative">
            <span className="absolute inset-y-0 start-3 flex items-center w-4 h-4 text-ink-muted self-center"><I.search/></span>
            <input placeholder="Search templates…" className="h-10 ps-9 pe-3 rounded-lg ring-1 ring-forest-900/15 bg-white text-[13px] w-72 outline-none focus:ring-2 focus:ring-forest-900"/>
          </div>
        </div>
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-3 gap-5">
        <TemplateCard id="TPL-01" title="Participant consent form" desc="Plain-language consent for adult, non-vulnerable populations. Includes privacy, risks, and right-to-withdraw clauses." refTag="NBCE §4.2" audience="Adults" prefill="SA-2026-04201" icon={I.doc}/>
        <TemplateCard id="TPL-02" title="Pediatric assent form" desc="Age-appropriate assent (7–17) paired with parental consent. Bilingual cover page recommended." refTag="ICH-GCP" audience="Pediatric" prefill="this draft" icon={I.user}/>
        <TemplateCard id="TPL-03" title="Study protocol summary" desc="One-page reviewer summary with population, intervention, primary outcome, and risk category." refTag="NBCE §3" audience="All studies" prefill="this draft" icon={I.file}/>
        <TemplateCard id="TPL-04" title="Data management plan" desc="Data classification, residency, retention period, k-anonymity, and breach response per PDPL." refTag="PDPL Art. 9" audience="Identifiable data" prefill="this draft" icon={I.shield}/>
        <TemplateCard id="TPL-05" title="Adverse event report" desc="Standardised SAE / AE reporting with timeline, severity, causality, and follow-up." refTag="Helsinki §17" audience="Active studies" prefill="—" icon={I.alert}/>
        <TemplateCard id="TPL-06" title="Annual progress report" desc="Required at 12-month anniversary of approval. Re-uses your protocol summary as a base." refTag="NBCE §6" audience="Active studies" prefill="last submission" icon={I.clock}/>
      </div>

      {/* Tertiary row — non-template resources */}
      <div className="mt-12">
        <h2 className="font-display text-[22px] font-bold text-forest-900 tracking-tight">Reading & policy</h2>
        <div className="grid grid-cols-4 gap-4 mt-5">
          {[
            ['NBCE 2024 guidance','PDF · 84 pages · Arabic + English',I.doc],
            ['Declaration of Helsinki','PDF · 14 pages · plain English digest',I.scale],
            ['PDPL · researcher digest','PDF · 22 pages · with case studies',I.shield],
            ['Plain-language style guide','PDF · 6 pages · how to write for participants',I.chat],
          ].map(([t,d,Ic],i)=>(
            <a key={i} className="bg-white rounded-2xl ring-1 ring-forest-900/10 shadow-soft p-4 flex items-start gap-3 hover:shadow-lift transition">
              <span className="w-10 h-10 rounded-lg bg-cream-100 text-forest-900 flex items-center justify-center"><span className="w-4 h-4"><Ic/></span></span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium text-forest-900 leading-snug">{t}</div>
                <div className="text-[11.5px] text-ink-muted mt-1">{d}</div>
              </div>
              <span className="w-4 h-4 text-ink-muted"><I.download/></span>
            </a>
          ))}
        </div>
      </div>
    </div>
  </div>
);

window.ResourcesArtboard = ResourcesArtboard;
