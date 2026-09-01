export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">OpenScrape</p>
      <h1>Turn websites into structured data.</h1>
      <p className="intro">Create a robot, run a scrape, and inspect the result from one calm workspace.</p>
      <section className="status-panel" aria-label="MVP status">
        <span className="status-dot" />
        <div>
          <strong>Workspace foundation ready</strong>
          <p>API, worker, and local infrastructure are being connected.</p>
        </div>
      </section>
    </main>
  );
}
