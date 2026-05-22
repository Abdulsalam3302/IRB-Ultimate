// Shared atoms — Logo, StampSeal, Icon helpers, Navbar, Footer, Badges.
// Exported to window so other Babel scripts can pick them up.

const Logo = ({ size = 28, withText = true, tone = 'forest' }) => {
  const fg = tone === 'cream' ? '#faf9f6' : '#064e3b';
  const tick = '#10b981';
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="IRB Ultimate">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <g transform="rotate(-8 16 16)">
          <rect x="4.5" y="4.5" width="23" height="23" rx="2.5" stroke={fg} strokeWidth="2" />
        </g>
        <path d="M9.5 16.5l4.5 4.5 9-10" stroke={tick} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      {withText && (
        <span className="font-display font-bold text-[15px] tracking-tight" style={{ color: fg }}>
          IRB<span style={{ color: tick }}>·</span>Ultimate
        </span>
      )}
    </span>
  );
};

// Lucide-like inline icons (we draw a curated few inline to avoid a CDN dep)
const I = {
  arrow: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  arrowL: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M11 5l-7 7 7 7"/></svg>,
  check: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12l4.5 4.5L19 7"/></svg>,
  sparkle: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9zM5 16l.7 1.6L7 18l-1.3.4L5 20l-.7-1.6L3 18l1.3-.4z"/></svg>,
  doc: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>,
  download: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  upload: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  shield: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  search: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>,
  filter: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 5h18M6 12h12M10 19h4"/></svg>,
  plus: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  globe: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>,
  sun: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
  user: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>,
  clock: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  bolt: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>,
  alert: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...p}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>,
  chat: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>,
  chev: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 18l6-6-6-6"/></svg>,
  chevD: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9l6 6 6-6"/></svg>,
  pin: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z"/></svg>,
  file: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>,
  scale: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v18M5 7h14M5 7l-2 6a4 4 0 0 0 8 0L9 7M19 7l-2 6a4 4 0 0 0 8 0L23 7"/></svg>,
};

// Status badge — application states
const StatusBadge = ({ status }) => {
  const map = {
    'draft': { bg:'bg-cream-200', fg:'text-ink-soft', dot:'bg-ink-faint', label:'Draft' },
    'ai-review': { bg:'bg-forest-50', fg:'text-forest-700', dot:'bg-forest-500', label:'AI review' },
    'submitted': { bg:'bg-forest-50', fg:'text-forest-700', dot:'bg-forest-500', label:'Submitted' },
    'under-review': { bg:'bg-amber-50', fg:'text-amber-800', dot:'bg-amber-500', label:'Under review' },
    'changes': { bg:'bg-rose-50', fg:'text-rose-700', dot:'bg-rose-500', label:'Changes requested' },
    'approved': { bg:'bg-jade-50', fg:'text-jade-700', dot:'bg-jade-500', label:'Approved' },
  };
  const s = map[status] || map.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 ${s.bg} ${s.fg} px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
};

// Buttons — shadcn-ish variants
const Btn = ({ variant='primary', size='md', icon, iconRight, children, className='', ...rest }) => {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-500';
  const sizes = { sm:'h-8 px-3 text-[13px]', md:'h-10 px-4 text-sm', lg:'h-12 px-5 text-[15px]' };
  const variants = {
    primary: 'bg-forest-900 text-cream-50 hover:bg-forest-800',
    jade: 'bg-jade-500 text-white hover:bg-jade-600',
    secondary: 'bg-cream-100 text-forest-900 ring-1 ring-forest-900/10 hover:bg-cream-200',
    ghost: 'text-forest-900 hover:bg-cream-200/60',
    outline: 'ring-1 ring-forest-900/15 text-forest-900 hover:bg-cream-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {icon && <span className="w-4 h-4 flex">{icon}</span>}
      <span>{children}</span>
      {iconRight && <span className="w-4 h-4 flex">{iconRight}</span>}
    </button>
  );
};

// "Stamped" pill — for hero / certificate accents
const Stamp = ({ children, className = '' }) => (
  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-forest-900/[0.04] text-forest-900 text-[12px] font-mono uppercase tracking-[0.16em] ring-1 ring-forest-900/10 ${className}`}>
    <span className="w-1.5 h-1.5 rounded-full bg-jade-500" />
    {children}
  </span>
);

// Card primitive
const Card = ({ children, className = '', ...rest }) => (
  <div className={`bg-white rounded-2xl shadow-soft ring-1 ring-forest-900/[0.06] ${className}`} {...rest}>{children}</div>
);

// Compact navbar — shows on most app pages
const Navbar = ({ active = 'home', lang = 'EN', dir = 'ltr', authed = false }) => (
  <header className="glass sticky top-0 z-30 border-b border-forest-900/10">
    <div className="max-w-[1280px] mx-auto h-16 px-6 flex items-center gap-8">
      <Logo />
      <nav className="hidden md:flex items-center gap-1 text-[13.5px] text-ink-soft">
        {[
          ['home','Home'], ['dashboard','Dashboard'], ['resources','Resources'],
          ['verify','Verify IRB'], ['support','Support']
        ].map(([k,v]) => (
          <a key={k} className={`px-3 py-1.5 rounded-md hover:bg-cream-200/70 transition ${active===k?'text-forest-900 font-semibold':''}`}>{v}</a>
        ))}
      </nav>
      <div className="ms-auto flex items-center gap-1.5">
        <button className="h-9 px-2.5 rounded-md hover:bg-cream-200/70 text-ink-soft flex items-center gap-1.5 text-[12.5px] font-medium">
          <span className="w-4 h-4"><I.globe/></span> {lang === 'AR' ? 'EN' : 'العربية'}
        </button>
        <button className="h-9 w-9 rounded-md hover:bg-cream-200/70 text-ink-soft flex items-center justify-center"><span className="w-4 h-4"><I.sun/></span></button>
        {authed ? (
          <div className="ms-1 flex items-center gap-2 pl-2 ps-2 border-l border-forest-900/10">
            <div className="h-8 w-8 rounded-full bg-forest-900 text-cream-50 font-mono text-[11px] flex items-center justify-center">SA</div>
          </div>
        ) : (
          <Btn variant="primary" size="sm" className="ms-1">Sign in</Btn>
        )}
      </div>
    </div>
  </header>
);

const DemoBanner = () => (
  <div className="bg-amber-50/80 border-b border-amber-200/70 text-amber-900 text-[12.5px]">
    <div className="max-w-[1280px] mx-auto px-6 py-2 flex items-center gap-3">
      <span className="font-mono uppercase tracking-[0.16em] text-[10.5px] bg-amber-200/70 px-1.5 py-0.5 rounded">Pilot</span>
      <span>You are using the pilot environment. Applications are reviewed by the live committee. Data follows PDPL.</span>
    </div>
  </div>
);

const Footer = () => (
  <footer className="bg-forest-950 text-cream-100 grain">
    <div className="max-w-[1280px] mx-auto px-6 py-14 grid grid-cols-12 gap-8">
      <div className="col-span-12 md:col-span-5">
        <Logo size={30} tone="cream" />
        <p className="mt-5 text-cream-200/70 text-[14px] leading-relaxed max-w-sm">
          Saudi Arabia's AI-assisted IRB approval platform. Aligned with NBCE, the Declaration of Helsinki, and Vision 2030 research priorities.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Stamp className="!bg-cream-50/10 !text-cream-50 !ring-cream-50/15">NBCE aligned</Stamp>
          <Stamp className="!bg-cream-50/10 !text-cream-50 !ring-cream-50/15">PDPL compliant</Stamp>
          <Stamp className="!bg-cream-50/10 !text-cream-50 !ring-cream-50/15">Vision 2030</Stamp>
        </div>
      </div>
      <div className="col-span-6 md:col-span-2">
        <h4 className="font-mono uppercase text-[10.5px] tracking-[0.18em] text-cream-50/50 mb-4">Platform</h4>
        <ul className="space-y-2 text-[13.5px] text-cream-50/85">
          <li>Dashboard</li><li>New application</li><li>Resources</li><li>Verify IRB</li>
        </ul>
      </div>
      <div className="col-span-6 md:col-span-2">
        <h4 className="font-mono uppercase text-[10.5px] tracking-[0.18em] text-cream-50/50 mb-4">Legal</h4>
        <ul className="space-y-2 text-[13.5px] text-cream-50/85">
          <li>Terms</li><li>Privacy / PDPL</li><li>Helsinki</li><li>ICH-GCP</li>
        </ul>
      </div>
      <div className="col-span-12 md:col-span-3">
        <h4 className="font-mono uppercase text-[10.5px] tracking-[0.18em] text-cream-50/50 mb-4">Partnership</h4>
        <p className="text-[13.5px] text-cream-50/85 leading-relaxed mb-4">
          For institutional collaboration or research-network partnerships, reach Dr. Aleid directly.
        </p>
        <button className="h-10 px-4 rounded-lg bg-cream-50 text-forest-950 font-medium text-[13px] inline-flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h4v16H4zM6 1.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM10 8h3.8v2.2h.1c.5-.95 1.86-1.95 3.83-1.95C21.65 8.25 22 10.7 22 13.3V20h-4v-5.7c0-1.36-.02-3.1-1.9-3.1-1.9 0-2.2 1.48-2.2 3v5.8h-4z"/></svg>
          Connect on LinkedIn
        </button>
      </div>
    </div>
    <div className="border-t border-cream-50/10">
      <div className="max-w-[1280px] mx-auto px-6 py-5 flex flex-col md:flex-row items-start md:items-center gap-3 justify-between text-[12px] text-cream-50/55">
        <div>© All copyrights preserved and registered to <span className="text-cream-50">Dr. Abdulsalam Aleid</span>. Operating under NBCE oversight.</div>
        <div className="font-mono uppercase tracking-[0.16em] text-[10.5px]">AHSS · KSA · v2.4.1</div>
      </div>
    </div>
  </footer>
);

// Mini progress bar (Stages 1 / 2)
const StageProgress = ({ step = 1, total = 2, percent = 64 }) => (
  <div className="flex items-center gap-4">
    <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-muted">Stage {step}/{total}</div>
    <div className="flex-1 h-1.5 rounded-full bg-cream-200 overflow-hidden">
      <div className="h-full bg-jade-500 rounded-full transition-all" style={{ width: percent + '%' }} />
    </div>
    <div className="font-mono num text-[11px] tracking-[0.14em] uppercase text-forest-900">{percent}%</div>
  </div>
);

Object.assign(window, { Logo, I, StatusBadge, Btn, Stamp, Card, Navbar, DemoBanner, Footer, StageProgress });
