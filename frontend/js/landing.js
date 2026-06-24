/* ============================================================
   AUROS LANDING PAGE — landing.js
   ============================================================ */

const Landing = (() => {
  let sphereAnimId = null;
  let globeAnimId = null;
  let nodeAnimId = null;
  let textSliderInterval = null;

  // DataFlow logo SVG
  const dataflowLogoSVG = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 28px; height: 28px; display: block; color: var(--color-ice-mist);">
      <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="var(--color-current-teal)"/>
      <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  // Render the entire landing page markup
  function render() {
    // Clear any running animation loops first to prevent leaks
    cleanup();

    const root = document.getElementById('app-root');
    root.innerHTML = `
      <!-- Fixed Navigation Bar -->
      <header class="top-nav" style="background: transparent; border-bottom: none;">
        <a href="#/landing" class="nav-logo">
          <div style="flex-shrink:0;">${dataflowLogoSVG}</div>
          <span class="nav-logo-text" style="font-size: 16px; font-weight: 500; letter-spacing: 2px;">DataFlow</span>
        </a>
        <nav class="nav-center">
          <button class="nav-link" onclick="Landing.scrollToSection('features-section')">Features</button>
          <button class="nav-link" onclick="Landing.scrollToSection('visual-builder-section')">Visual Builder</button>
          <button class="nav-link" onclick="Landing.scrollToSection('connectors-section')">Connectors</button>
          <button class="nav-link" onclick="Landing.scrollToSection('performance-section')">Performance</button>
          <button class="nav-link" onclick="Landing.scrollToSection('scale-section')">Scale</button>
        </nav>
        <div class="nav-right" style="display: flex; gap: 12px; align-items: center;">
          <a href="#/login/auto" class="btn btn-gradient-border btn-sm" style="text-decoration: none;">Login</a>
          <button class="btn btn-primary-gradient btn-sm" onclick="Landing.openPartnerModal()">Request Access</button>
        </div>
      </header>

      <!-- Hero Section -->
      <section class="landing-hero" id="hero-section">
        <div class="hero-inner">
          <div class="hero-content">
            <div class="eyebrow-container">
              <div class="eyebrow-dot"></div>
              <div class="eyebrow-text">DATAFLOW</div>
            </div>
            
            <div class="hero-title-slider">
              <h1 class="hero-title active" id="hero-title-1">Visual Data<br>Transformation</h1>
              <h1 class="hero-title" id="hero-title-2">Zero Code<br>Pipelines</h1>
            </div>

            <p class="hero-desc">Ingest data from files or APIs, transform it on a visual drag-and-drop canvas, and schedule recurring runs with ease.</p>
            
            <div class="hero-actions">
              <a href="#/login" class="btn btn-primary-gradient">Launch Builder ↗</a>
            </div>
          </div>

          <div class="hero-particle-wrap">
            <canvas id="sphere-canvas"></canvas>
          </div>
        </div>
      </section>

      <!-- Section 1: Features -->
      <section class="features-section" id="features-section">
        <div class="reveal-on-scroll">
          <div class="eyebrow-container">
            <div class="eyebrow-dot"></div>
            <div class="eyebrow-text">FEATURES</div>
          </div>
          <h2 class="section-title">Powering self-service ETL</h2>
          <p class="section-subtitle">Data transformation simplified for everyone. No programming required.</p>
        </div>

        <div class="features-grid">
          <div class="feature-item reveal-on-scroll">
            <div class="feature-icon">⚙️</div>
            <h3 class="feature-item-title">No-Code Rule Engine</h3>
            <p class="feature-item-desc">Build complex condition logic, formula computations, field mappings, and regular expression patterns via clean, interactive form controls.</p>
          </div>
          
          <div class="feature-item reveal-on-scroll">
            <div class="feature-icon">👁️</div>
            <h3 class="feature-item-title">Live Data Preview</h3>
            <p class="feature-item-desc">See the impact of your transformations instantly. The in-app preview table displays the first rows of your dataset after each step is applied.</p>
          </div>

          <div class="feature-item reveal-on-scroll">
            <div class="feature-icon">⏱️</div>
            <h3 class="feature-item-title">Cron-Based Scheduler</h3>
            <p class="feature-item-desc">Set workflows to run automatically at selected hourly, daily, or custom intervals. Track execution logs and status alerts from a single dashboard.</p>
          </div>

          <div class="feature-item reveal-on-scroll">
            <div class="feature-icon">🔄</div>
            <h3 class="feature-item-title">Version History</h3>
            <p class="feature-item-desc">Save pipeline drafts, publish production versions, and easily roll back to previous workflows with one click.</p>
          </div>
        </div>
      </section>

      <!-- Section 2: Visual Builder -->
      <section class="visual-builder-section" id="visual-builder-section">
        <div class="reveal-on-scroll">
          <div class="eyebrow-container">
            <div class="eyebrow-dot"></div>
            <div class="eyebrow-text">VISUAL BUILDER</div>
          </div>
          <h2 class="section-title">Interactive node canvas</h2>
        </div>

        <div class="builder-layout">
          <div class="builder-left">
            <div class="explore-card reveal-on-scroll" onclick="window.location.hash='#/login'">
              <div class="explore-card-header">
                <h3 class="explore-card-title">Drag-and-Drop Editor</h3>
                <div class="card-arrow-btn">↗</div>
              </div>
              <p class="explore-card-desc">Add input readers, transform tasks, and output sinks to an infinite interactive grid. Connect nodes by dragging edges to form clear data flow models.</p>
            </div>

            <div class="explore-card reveal-on-scroll" onclick="window.location.hash='#/login'">
              <div class="explore-card-header">
                <h3 class="explore-card-title">Dynamic Sidebar Config</h3>
                <div class="card-arrow-btn">↗</div>
              </div>
              <p class="explore-card-desc">Clicking any node on the canvas slides open a dedicated settings panel. Configure column renames, lookup dictionaries, formulas, or custom API options on the fly.</p>
            </div>
          </div>

          <div class="builder-right reveal-on-scroll">
            <canvas id="node-canvas" class="node-canvas"></canvas>
          </div>
        </div>
      </section>

      <!-- Section 3: Connectors -->
      <section class="connectors-section" id="connectors-section">
        <div class="network-card reveal-on-scroll">
          <div class="network-left">
            <div class="eyebrow-container">
              <div class="eyebrow-dot"></div>
              <div class="eyebrow-text">CONNECTORS</div>
            </div>
            <h2 class="network-title">Universal data integrations</h2>
            <p class="network-desc">Ingest datasets from files (CSV, Excel, XML, JSON) or connect directly to third-party REST API endpoints. Output data directly to S3 buckets, local file downloads, or external webhook APIs.</p>
            <button class="btn btn-gradient-border" onclick="window.location.hash='#/login'">Launch Connectors ↗</button>
          </div>
          <div class="network-right">
            <canvas id="globe-canvas" class="globe-canvas"></canvas>
          </div>
        </div>
      </section>

      <!-- Section 4: Performance -->
      <section class="performance-section" id="performance-section">
        <div class="reveal-on-scroll">
          <div class="eyebrow-container">
            <div class="eyebrow-dot"></div>
            <div class="eyebrow-text">PERFORMANCE</div>
          </div>
          <h2 class="section-title">Sub-second execution</h2>
        </div>

        <div class="perf-layout">
          <div class="perf-left reveal-on-scroll">
            <div class="stat-hero-card">
              <div class="stat-hero-label">Speedup vs Pandas</div>
              <div class="stat-hero-value" data-target="100" data-suffix="x">0x</div>
            </div>
          </div>
          <div class="perf-right reveal-on-scroll">
            <div class="perf-info-card">
              <h3 class="perf-info-title">Polars & DuckDB Engines</h3>
              <p class="perf-info-text">Traditional ETL systems run into high memory limits and single-thread constraints. DataFlow integrates Rust-based Polars dataframes and in-process DuckDB engines to query and transform files with multi-threaded, parallel speed.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 5: Scale -->
      <section class="scale-section" id="scale-section">
        <div class="reveal-on-scroll">
          <div class="eyebrow-container">
            <div class="eyebrow-dot"></div>
            <div class="eyebrow-text">SCALE</div>
          </div>
          <h2 class="section-title">Built for enterprise volume</h2>
          <p class="section-subtitle">Asynchronous execution allows DataFlow to process millions of rows without degrading user experience.</p>
        </div>

        <div class="scale-grid">
          <div class="stat-regular-card reveal-on-scroll">
            <div class="stat-label-muted">Maximum File Row Support</div>
            <div class="stat-value-luminous" data-target="10" data-suffix="M+">0M+</div>
          </div>
          
          <div class="stat-regular-card reveal-on-scroll">
            <div class="stat-label-muted">Active Automated Workflows</div>
            <div class="stat-value-luminous" data-target="250" data-suffix="K+">0K+</div>
          </div>

          <div class="stat-regular-card reveal-on-scroll">
            <div class="stat-label-muted">Pre-Built Endpoint Targets</div>
            <div class="stat-value-luminous" data-target="40" data-suffix="+">0+</div>
          </div>
        </div>

        <!-- Celery explanation card -->
        <div class="scale-architecture-card reveal-on-scroll">
          <h3 class="arch-card-title">Distributed Task Architecture</h3>
          <p class="arch-card-desc">When you run or schedule a workflow, the FastAPI server pushes execution tasks to a Celery background queue brokered by Redis/RabbitMQ. Isolated workers fetch these tasks, stream file chunks, and update databases asynchronously, keeping the application fast and responsive.</p>
        </div>
      </section>

      <!-- Sleek Partner Modal -->
      <div class="modal-backdrop" id="modal-partner">
        <div class="modal" style="max-width: 500px;">
          <div class="modal-header">
            <span class="modal-title">Request Sandbox Access</span>
            <button class="modal-close" onclick="Landing.closePartnerModal()">✕</button>
          </div>
          <div class="modal-body">
            <p style="color: var(--color-fog-veil); font-size: 13px; margin-bottom: var(--spacing-24);">
              Submit your request and our integrations team will set up your workspace credentials shortly.
            </p>
            <form onsubmit="Landing.handlePartnerSubmit(event)">
              <div class="form-group">
                <label class="form-label">Company Name</label>
                <input class="form-input" type="text" required placeholder="Enter company name" />
              </div>
              <div class="form-group">
                <label class="form-label">Contact Email</label>
                <input class="form-input" type="email" required placeholder="Enter email address" />
              </div>
              <div class="form-group">
                <label class="form-label">Primary Use Case</label>
                <select class="form-select">
                  <option>Visual Data Transformations (ETL)</option>
                  <option>Automating API Ingestion</option>
                  <option>Database Integrations & Migration</option>
                  <option>No-Code Rule Engine Tasks</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Workspace Requirements</label>
                <textarea class="form-input" style="min-height: 80px; font-family: var(--font-matter);" required placeholder="Describe your data pipeline requirements…"></textarea>
              </div>
              <button type="submit" class="btn btn-primary-gradient" style="width: 100%; justify-content: center; margin-top: 10px;">
                Request Access ↗
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    // Initialize interactive modules
    initSphereAnimation();
    initGlobeAnimation();
    initNodeNetworkAnimation();
    initScrollReveal();
    initHeroTextSlider();
    
    // Smooth navigation bar background change on scroll
    window.addEventListener('scroll', handleNavbarScroll);
  }

  // Cleanup helper to destroy running animation frames & timers
  function cleanup() {
    if (sphereAnimId) cancelAnimationFrame(sphereAnimId);
    if (globeAnimId) cancelAnimationFrame(globeAnimId);
    if (nodeAnimId) cancelAnimationFrame(nodeAnimId);
    if (textSliderInterval) clearInterval(textSliderInterval);
    window.removeEventListener('scroll', handleNavbarScroll);
  }

  // Smooth scroll to a section on the page
  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Sticky Navbar scroll visual update
  function handleNavbarScroll() {
    const nav = document.querySelector('.top-nav');
    if (!nav) return;
    if (window.scrollY > 50) {
      nav.style.background = 'rgba(1, 38, 36, 0.85)';
      nav.style.backdropFilter = 'blur(12px)';
      nav.style.webkitBackdropFilter = 'blur(12px)';
      nav.style.borderBottom = '1px solid rgba(237, 255, 254, 0.06)';
    } else {
      nav.style.background = 'transparent';
      nav.style.backdropFilter = 'none';
      nav.style.webkitBackdropFilter = 'none';
      nav.style.borderBottom = 'none';
    }
  }

  // Hero Title Switcher
  function initHeroTextSlider() {
    const t1 = document.getElementById('hero-title-1');
    const t2 = document.getElementById('hero-title-2');
    let state = 1;

    textSliderInterval = setInterval(() => {
      if (state === 1) {
        t1.classList.remove('active');
        setTimeout(() => {
          t2.classList.add('active');
        }, 400);
        state = 2;
      } else {
        t2.classList.remove('active');
        setTimeout(() => {
          t1.classList.add('active');
        }, 400);
        state = 1;
      }
    }, 4500);
  }

  // Scroll animations: fade in & stats count up
  function initScrollReveal() {
    const items = document.querySelectorAll('.reveal-on-scroll');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          
          // Trigger count animation if this is the stats card
          const counters = entry.target.querySelectorAll('[data-target]');
          counters.forEach(c => {
            animateCount(c);
          });

          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    items.forEach(i => observer.observe(i));
  }

  // Numeric count up animation
  function animateCount(el) {
    const target = parseFloat(el.getAttribute('data-target'));
    const suffix = el.getAttribute('data-suffix') || '';
    const prefix = el.getAttribute('data-prefix') || '';
    const isFloat = target.toString().indexOf('.') !== -1;
    const duration = 1500;
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing out quadratic
      const ease = progress * (2 - progress);
      const val = ease * target;

      if (isFloat) {
        el.textContent = prefix + val.toFixed(2) + suffix;
      } else {
        el.textContent = prefix + Math.floor(val) + suffix;
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = prefix + target + suffix;
      }
    }

    requestAnimationFrame(update);
  }

  // 1. 3D Particle Sphere Animation
  function initSphereAnimation() {
    const canvas = document.getElementById('sphere-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W = canvas.width = canvas.parentElement.clientWidth;
    let H = canvas.height = canvas.parentElement.clientHeight;

    window.addEventListener('resize', () => {
      if (!canvas || !canvas.parentElement) return;
      W = canvas.width = canvas.parentElement.clientWidth;
      H = canvas.height = canvas.parentElement.clientHeight;
    });

    const particles = [];
    const count = 180;
    const radius = 170;

    // Generate uniformly distributed points on a sphere (Fibonacci lattice)
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;

      particles.push({
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.sin(phi) * Math.sin(theta),
        z: radius * Math.cos(phi),
        color: i % 2 === 0 ? '#00827c' : '#cbfffc'
      });
    }

    let angleX = 0.003;
    let angleY = 0.005;

    function rotateX(p, angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const y = p.y * cos - p.z * sin;
      const z = p.z * cos + p.y * sin;
      p.y = y;
      p.z = z;
    }

    function rotateY(p, angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = p.x * cos - p.z * sin;
      const z = p.z * cos + p.x * sin;
      p.x = x;
      p.z = z;
    }

    // Capture mouse coordinate to tilt sphere
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - W / 2;
      const y = e.clientY - rect.top - H / 2;
      if (Math.abs(x) < W && Math.abs(y) < H) {
        mouseX = x * 0.00005;
        mouseY = y * 0.00005;
      }
    });

    function draw() {
      ctx.clearRect(0, 0, W, H);

      const focalLength = 320;
      const cx = W / 2;
      const cy = H / 2 + 50; // offset slightly lower, peeking out

      // Apply rotations
      particles.forEach(p => {
        rotateX(p, angleX + mouseY);
        rotateY(p, angleY + mouseX);
      });

      // Sort by Z for proper depth rendering
      particles.sort((a, b) => b.z - a.z);

      // Render faint connections for particles in the front
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        if (p1.z < 0) continue; // Don't draw connections in back to reduce noise

        const scale1 = focalLength / (focalLength + p1.z);
        const x1 = cx + p1.x * scale1;
        const y1 = cy + p1.y * scale1;

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          if (p2.z < -50) continue;

          // Connect if they are spatially close
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
          if (dist < 60) {
            const scale2 = focalLength / (focalLength + p2.z);
            const x2 = cx + p2.x * scale2;
            const y2 = cy + p2.y * scale2;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = `rgba(0, 130, 124, ${(1 - dist / 60) * 0.15 * scale1})`;
            ctx.stroke();
          }
        }
      }

      // Draw bioluminescent particle glows
      particles.forEach(p => {
        const scale = focalLength / (focalLength + p.z);
        const x = cx + p.x * scale;
        const y = cy + p.y * scale;

        if (x < 0 || x > W || y < 0 || y > H) return;

        const size = Math.max(1, (p.z + radius) / (2 * radius) * 3 + 0.5);
        const alpha = (p.z + radius) / (2 * radius) * 0.75 + 0.1;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fill();

        // Draw radial outer bloom for bright particles in front
        if (p.z > 80) {
          ctx.beginPath();
          ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#cbfffc';
          ctx.globalAlpha = alpha * 0.25;
          ctx.fill();
        }
      });

      ctx.globalAlpha = 1.0;
      sphereAnimId = requestAnimationFrame(draw);
    }

    draw();
  }

  // 2. 3D Rotating Dotted Globe Animation
  function initGlobeAnimation() {
    const canvas = document.getElementById('globe-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W = canvas.width = canvas.parentElement.clientWidth;
    let H = canvas.height = canvas.parentElement.clientHeight;

    window.addEventListener('resize', () => {
      if (!canvas || !canvas.parentElement) return;
      W = canvas.width = canvas.parentElement.clientWidth;
      H = canvas.height = canvas.parentElement.clientHeight;
    });

    const particles = [];
    const radius = 130;
    const latRings = 15;
    const lonPoints = 28;

    // Generate latitude/longitude rings grid
    for (let i = 1; i < latRings; i++) {
      const lat = (Math.PI * i) / latRings;
      for (let j = 0; j < lonPoints; j++) {
        const lon = (2 * Math.PI * j) / lonPoints;

        // Spherical to Cartesian coords
        const x = radius * Math.sin(lat) * Math.cos(lon);
        const y = radius * Math.cos(lat);
        const z = radius * Math.sin(lat) * Math.sin(lon);

        // Add small perturbation to look less mechanical
        const noise = (Math.random() - 0.5) * 2;
        particles.push({
          x: x + noise,
          y: y + noise,
          z: z,
          baseColor: i % 2 === 0 ? '#cbfffc' : '#00827c'
        });
      }
    }

    let angleY = 0.007;

    function rotateY(p, angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = p.x * cos - p.z * sin;
      const z = p.z * cos + p.x * sin;
      p.x = x;
      p.z = z;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      const focalLength = 300;
      const cx = W / 2;
      const cy = H / 2;

      // Draw faint atmosphere glow circle
      const gradient = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.3);
      gradient.addColorStop(0, 'rgba(0, 130, 124, 0.08)');
      gradient.addColorStop(0.5, 'rgba(250, 209, 255, 0.02)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Apply rotation
      particles.forEach(p => rotateY(p, angleY));

      // Sort particles by Z so front dots cover back ones
      particles.sort((a, b) => b.z - a.z);

      particles.forEach(p => {
        const scale = focalLength / (focalLength + p.z);
        const x = cx + p.x * scale;
        const y = cy + p.y * scale;

        // Size and transparency depending on depth (Z)
        const size = Math.max(0.6, (p.z + radius) / (2 * radius) * 2.2 + 0.4);
        const alpha = (p.z + radius) / (2 * radius) * 0.7 + 0.1;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = p.baseColor;
        ctx.globalAlpha = alpha;
        ctx.fill();
      });

      ctx.globalAlpha = 1.0;
      globeAnimId = requestAnimationFrame(draw);
    }

    draw();
  }

  // 3. Explore Node Network Animation
  function initNodeNetworkAnimation() {
    const canvas = document.getElementById('node-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W = canvas.width = canvas.parentElement.clientWidth;
    let H = canvas.height = canvas.parentElement.clientHeight;

    window.addEventListener('resize', () => {
      if (!canvas || !canvas.parentElement) return;
      W = canvas.width = canvas.parentElement.clientWidth;
      H = canvas.height = canvas.parentElement.clientHeight;
    });

    // Custom constellation layout
    const nodes = [
      { id: 0, x: W * 0.5, y: H * 0.25, r: 8, pulse: 0, speed: 0.03 },
      { id: 1, x: W * 0.25, y: H * 0.45, r: 6, pulse: 2.1, speed: 0.04 },
      { id: 2, x: W * 0.75, y: H * 0.45, r: 6, pulse: 4.2, speed: 0.02 },
      { id: 3, x: W * 0.5, y: H * 0.5, r: 10, pulse: 1.5, speed: 0.02 },
      { id: 4, x: W * 0.35, y: H * 0.75, r: 7, pulse: 3.0, speed: 0.05 },
      { id: 5, x: W * 0.65, y: H * 0.75, r: 7, pulse: 0.8, speed: 0.03 },
      { id: 6, x: W * 0.15, y: H * 0.68, r: 5, pulse: 2.5, speed: 0.04 },
      { id: 7, x: W * 0.85, y: H * 0.68, r: 5, pulse: 1.9, speed: 0.03 }
    ];

    const connections = [
      { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 0, to: 3 },
      { from: 1, to: 3 }, { from: 2, to: 3 }, { from: 1, to: 6 },
      { from: 2, to: 7 }, { from: 3, to: 4 }, { from: 3, to: 5 },
      { from: 4, to: 6 }, { from: 5, to: 7 }, { from: 4, to: 5 }
    ];

    // Flying data packets
    const packets = [];
    const maxPackets = 7;

    function spawnPacket() {
      if (packets.length >= maxPackets) return;
      const conn = connections[Math.floor(Math.random() * connections.length)];
      packets.push({
        from: nodes[conn.from],
        to: nodes[conn.to],
        progress: 0,
        speed: Math.random() * 0.007 + 0.005,
        size: Math.random() * 2 + 1.5
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Render grid grid-lines faintly
      ctx.strokeStyle = 'rgba(0, 130, 124, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < W; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Draw connection lines
      ctx.strokeStyle = 'rgba(237, 255, 254, 0.06)';
      ctx.lineWidth = 1.5;
      connections.forEach(conn => {
        const from = nodes[conn.from];
        const to = nodes[conn.to];
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      });

      // Spawn packets occasionally
      if (Math.random() < 0.03) {
        spawnPacket();
      }

      // Draw & update packets
      packets.forEach((p, idx) => {
        p.progress += p.speed;
        if (p.progress >= 1) {
          packets.splice(idx, 1);
          return;
        }

        const x = p.from.x + (p.to.x - p.from.x) * p.progress;
        const y = p.from.y + (p.to.y - p.from.y) * p.progress;

        // Draw packet glow
        const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, p.size * 3);
        glowGrad.addColorStop(0, '#cbfffc');
        glowGrad.addColorStop(0.3, 'rgba(0, 130, 124, 0.6)');
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw nodes
      nodes.forEach(n => {
        n.pulse += n.speed;
        const pulseSize = n.r + Math.sin(n.pulse) * 1.5;
        const opacity = 0.75 + Math.sin(n.pulse) * 0.15;

        // Draw outer glow circle
        ctx.fillStyle = '#00827c';
        ctx.globalAlpha = opacity * 0.2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, pulseSize * 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Draw inner white node
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(n.x, n.y, pulseSize * 0.7, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1.0;
      nodeAnimId = requestAnimationFrame(draw);
    }

    draw();
  }

  // Partner Modal operations
  function openPartnerModal() {
    document.getElementById('modal-partner').classList.add('show');
  }

  function closePartnerModal() {
    document.getElementById('modal-partner').classList.remove('show');
  }

  function handlePartnerSubmit(e) {
    e.preventDefault();
    UI.toast('Partner request submitted successfully! Our team will contact you.', 'success');
    closePartnerModal();
  }

  return { render, scrollToSection, openPartnerModal, closePartnerModal, handlePartnerSubmit };
})();

window.Landing = Landing;
