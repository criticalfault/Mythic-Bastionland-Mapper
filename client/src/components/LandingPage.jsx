import React from 'react';
import screenshotMap    from '../assets/screenshot-map.jpg';
import screenshotBuild  from '../assets/screenshot-build.jpg';
import screenshotReveal from '../assets/screenshot-reveal.jpg';

export default function LandingPage({ onSignIn }) {
  return (
    <div className="landing">

      {/* ── HERO ── */}
      <header className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-knight" aria-hidden="true">♞</div>
          <h1 className="landing-title">Mythic Bastionland<br /><span className="landing-title-sub">Online Mapper</span></h1>
          <p className="landing-tagline">
            A free, real-time hex map tool built for playing<br />
            <a href="https://www.nullsheen.com/mythic-bastionland/" target="_blank" rel="noopener noreferrer">Mythic Bastionland</a> remotely with your group.
          </p>
          <button className="btn-google landing-cta" onClick={onSignIn}>
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google to play
          </button>
          <p className="landing-free-note">Free to use — no account needed beyond Google sign-in</p>
        </div>
      </header>

      {/* ── HERO SCREENSHOT ── */}
      <section className="landing-screenshot-section" aria-label="App screenshot">
        <div className="landing-section-inner">
          <img
            src={screenshotMap}
            alt="Mythic Bastionland Mapper showing a hex map with fog of war and player tokens"
            className="landing-screenshot-img"
          />
        </div>
      </section>

      {/* ── WHAT IS IT ── */}
      <section className="landing-section" aria-labelledby="what-heading">
        <div className="landing-section-inner landing-section-narrow">
          <h2 id="what-heading" className="landing-section-title">What is this?</h2>
          <p className="landing-body">
            Mythic Bastionland Mapper is a browser-based virtual tabletop tool designed specifically for
            <strong> Chris McDowall's <a href="https://www.nullsheen.com/mythic-bastionland/" target="_blank" rel="noopener noreferrer">Mythic Bastionland</a></strong>.
            It lets your group play together online with a shared hex map — no software to install, no subscription required.
          </p>
          <p className="landing-body">
            The GM builds the realm in secret, then reveals the land tile by tile as the players explore. Players
            see only what has been uncovered. Everything updates live for everyone at the table.
          </p>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="landing-section landing-section-dark" aria-labelledby="features-heading">
        <div className="landing-section-inner">
          <h2 id="features-heading" className="landing-section-title">Features</h2>
          <div className="landing-features">

            <article className="landing-feature">
              <div className="landing-feature-icon" aria-hidden="true">🌫</div>
              <h3>Fog of War</h3>
              <p>Players only see the hexes the GM has revealed. The rest of the realm stays hidden until the party ventures there.</p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature-icon" aria-hidden="true">⚔️</div>
              <h3>Real-Time Sync</h3>
              <p>Every map change, token move, and dice roll is broadcast to all connected players instantly via live WebSockets — no refreshing needed.</p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature-icon" aria-hidden="true">♞</div>
              <h3>Party & Player Tokens</h3>
              <p>The GM moves a shared party token across the map. Individual player tokens can be added for each adventurer, each with their own colour.</p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature-icon" aria-hidden="true">🎲</div>
              <h3>Dice Roller</h3>
              <p>Roll any combination of dice (d4 through d20) from inside the app. A persistent roll log keeps the session history visible to everyone.</p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature-icon" aria-hidden="true">💬</div>
              <h3>In-App Chat</h3>
              <p>A built-in text chat panel lets the table communicate without switching to a separate app. GM messages are highlighted in gold.</p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature-icon" aria-hidden="true">🔒</div>
              <h3>Private Realms</h3>
              <p>Create a realm, share a six-character invite code with your players, and optionally password-protect it. Each game is fully separate.</p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature-icon" aria-hidden="true">💾</div>
              <h3>Save & Load</h3>
              <p>Save your map layout and full game state to the cloud. Pick up exactly where you left off — tokens, revealed hexes, and all.</p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature-icon" aria-hidden="true">🖼</div>
              <h3>PNG Export</h3>
              <p>Export a GM view or player view of the current map as a PNG — useful for session notes or sharing on Discord.</p>
            </article>

          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="landing-section" aria-labelledby="how-heading">
        <div className="landing-section-inner">
          <h2 id="how-heading" className="landing-section-title">How it works</h2>
          <div className="landing-how">

            <div className="landing-how-column">
              <h3 className="landing-how-role">For the GM</h3>
              <ol className="landing-steps">
                <li><span>Sign in with Google and create a new Realm.</span></li>
                <li><span>Share the six-character invite code with your players.</span></li>
                <li><span>Switch to <strong>Build Mode</strong> to paint terrain tiles and place special locations on the hex grid.</span></li>
                <li><span>Switch to <strong>Play Mode</strong> and left-click hexes to reveal them to players as the session progresses.</span></li>
                <li><span>Move the party token, add player tokens, roll dice, and chat — all from the same screen.</span></li>
              </ol>
            </div>

            <div className="landing-how-divider" aria-hidden="true" />

            <div className="landing-how-column">
              <h3 className="landing-how-role">For Players</h3>
              <ol className="landing-steps">
                <li><span>Sign in with Google.</span></li>
                <li><span>Enter the invite code your GM gave you and join the realm.</span></li>
                <li><span>Watch the map fill in as the GM reveals each hex — fog of war hides the rest.</span></li>
                <li><span>Left-click a hex to ping the map for the whole table.</span></li>
                <li><span>Roll dice, chat with the party, and track where your tokens are.</span></li>
              </ol>
            </div>

          </div>
        </div>
      </section>

      {/* ── BUILD / REVEAL SCREENSHOTS ── */}
      <section className="landing-section landing-section-dark" aria-label="Build and reveal mode screenshots">
        <div className="landing-section-inner">
          <div className="landing-two-screenshots">
            <figure className="landing-figure">
              <img
                src={screenshotBuild}
                alt="GM painting terrain tiles in Build Mode"
                className="landing-screenshot-img"
              />
              <figcaption>Build Mode — paint the realm tile by tile before your session</figcaption>
            </figure>
            <figure className="landing-figure">
              <img
                src={screenshotReveal}
                alt="Players seeing revealed hexes with fog of war surrounding unexplored areas"
                className="landing-screenshot-img"
              />
              <figcaption>Play Mode — reveal hexes to players as they explore</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="landing-section landing-cta-section" aria-labelledby="start-heading">
        <div className="landing-section-inner landing-section-narrow" style={{ textAlign: 'center' }}>
          <h2 id="start-heading" className="landing-section-title">Ready to explore?</h2>
          <p className="landing-body" style={{ marginBottom: '1.5rem' }}>
            Sign in to create your first realm or join one your GM has already set up.
          </p>
          <button className="btn-google landing-cta" onClick={onSignIn}>
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        <p>
          Built for <a href="https://www.nullsheen.com/mythic-bastionland/" target="_blank" rel="noopener noreferrer">Mythic Bastionland</a> by <a href="https://www.nullsheen.com/" target="_blank" rel="noopener noreferrer">nullsheen.com</a>
          {' · '}
          Mythic Bastionland is created by <a href="https://www.bastionland.com/" target="_blank" rel="noopener noreferrer">Chris McDowall</a>
        </p>
      </footer>

    </div>
  );
}
