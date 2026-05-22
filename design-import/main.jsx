// main.jsx — assemble the design canvas.

const App = () => (
  <DesignCanvas>
    <DCSection id="system" title="01 · Foundation" subtitle="Tokens · type · components — the system everything else inherits from.">
      <DCArtboard id="ds-light" label="System · white surface" width={1440} height={1950}>
        <SystemArtboardLight/>
      </DCArtboard>
      <DCArtboard id="ds-dark" label="System · forest surface" width={1440} height={1950}>
        <SystemArtboardDark/>
      </DCArtboard>
    </DCSection>

    <DCSection id="marketing" title="02 · Home" subtitle="Public landing — researchers, journals, public verifiers all start here.">
      <DCArtboard id="home" label="Home · /" width={1440} height={2860}>
        <HomeArtboard/>
      </DCArtboard>
    </DCSection>

    <DCSection id="app" title="03 · Authenticated app" subtitle="The researcher's working surface — dashboard, application form, AI review.">
      <DCArtboard id="dashboard" label="Dashboard · /dashboard" width={1440} height={1500}>
        <DashboardArtboard/>
      </DCArtboard>
      <DCArtboard id="stage1" label="Apply Stage 1 · /apply/:id/stage1" width={1440} height={1750}>
        <Stage1Artboard/>
      </DCArtboard>
    </DCSection>

    <DCSection id="format" title="04 · Format & Resources" subtitle="The Q&A wizard and the dual-route template grid — solves the 'blank vs pre-filled' confusion.">
      <DCArtboard id="wizard" label="Format wizard · /format/:slug" width={1440} height={1900}>
        <WizardArtboard/>
      </DCArtboard>
      <DCArtboard id="resources" label="Resources · /resources" width={1440} height={1600}>
        <ResourcesArtboard/>
      </DCArtboard>
    </DCSection>

    <DCSection id="rtl" title="05 · Arabic / RTL" subtitle="Full mirror, with notes on the few things that don't flip.">
      <DCArtboard id="ar-dashboard" label="Dashboard · العربية" width={1440} height={1300}>
        <ArabicArtboard/>
      </DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
