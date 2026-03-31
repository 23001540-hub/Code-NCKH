/* ═══════════════════════════════════════════════════════════
   UNIS Demand Forecast — Main Application
   ═══════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════
const CONFIG = {
  API_BASE: '',
  DEBOUNCE_MS: 300,
  MAX_PULSE_SKUS: 8,
  CHART_COLORS: [
    '#10b981', '#f59e0b', '#3b82f6', '#ef4444',
    '#8b5cf6', '#fb7185', '#34d399', '#fbbf24'
  ],
  SEGMENT_COLORS: {
    A: '#10b981', B: '#f59e0b', C1: '#ef4444',
    C2: '#fb7185', D1: '#3b82f6', D2: '#8b5cf6',
    ML_CANDIDATE: '#10b981', MA3_CANDIDATE: '#f59e0b',
    TOO_SPARSE: '#ef4444', COLD_START: '#3b82f6'
  },
  SEGMENT_SHORT: {
    ML_CANDIDATE: 'A', MA3_CANDIDATE: 'B',
    TOO_SPARSE: 'C', COLD_START: 'D'
  },
  SEGMENT_NAME: {
    ML_CANDIDATE: 'ML Candidate (A)', MA3_CANDIDATE: 'MA3 Candidate (B)',
    TOO_SPARSE: 'Too Sparse (C)', COLD_START: 'Cold Start (D)'
  }
};

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const STATE = {
  currentTab: 'sku-list',
  config: null,
  summary: null,
  forecastSummary: null,
  // SKU List
  filters: {
    segment: '', can_forecast: '', status: '',
    activity_label: '', lifecycle_stage: '', verdict: '',
    search: '', sort_by: 'total_qty', sort_dir: 'desc',
    page: 1, per_page: 100
  },
  skuData: null,
  monthCols: [],
  // Similarity
  simFilters: { method: '', search: '', page: 1, per_page: 50 },
  simData: null,
  // Pulse
  pulseSearch: '', pulseSeg: '',
  pulseSkuList: [],
  pulseSelected: [], // [{sku, product_name, segment}]
  pulseChartData: {}, // sku -> monthly[]
  pulseChart: null,
  pulseSeries: [],
  // Segment explain
  segExplainData: null,
  segExplainOpen: false,
  // Forecast overview
  forecastData: null,
  // Forecast detail table
  fcFilters: { segment: '', accuracy_tier: '', search: '', sort_by: 'forecast_08', sort_dir: 'desc', page: 1, per_page: 50 },
  fcDetailData: null
};

// ═══════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════
async function api(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

// ═══════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════
function initLanding() {
  const landing = document.getElementById('landingPage');
  if (!landing) return;

  // ── Slide navigation dots ──
  const slides = landing.querySelectorAll('.slide');
  const dots = landing.querySelectorAll('.slide-dot');

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.slide);
      const target = document.getElementById('slide' + idx);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Update active dot on scroll
  const slideObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const idx = Array.from(slides).indexOf(e.target);
        dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      }
    });
  }, { threshold: 0.55, root: landing });
  slides.forEach(s => slideObserver.observe(s));

  // ── Intersection Observer for AOS animations ──
  const aosObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const delay = parseInt(e.target.dataset.delay || 0) * 150;
        setTimeout(() => e.target.classList.add('visible'), delay);
      }
    });
  }, { threshold: 0.15, root: landing });
  landing.querySelectorAll('[data-aos]').forEach(el => aosObserver.observe(el));

  // ── Animated counters ──
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !e.target.dataset.counted) {
        e.target.dataset.counted = '1';
        animateCounter(e.target);
      }
    });
  }, { threshold: 0.3, root: landing });
  landing.querySelectorAll('.counter').forEach(el => counterObserver.observe(el));

  function animateCounter(el) {
    const target = parseInt(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    const duration = 1800;
    const start = performance.now();
    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      let current = Math.round(eased * target);
      // Format large numbers
      if (target >= 1000 && target < 1000000) {
        el.textContent = current.toLocaleString() + suffix;
      } else if (target >= 1000000) {
        // Show as K
        el.textContent = Math.round(current / 1000) + suffix;
      } else {
        el.textContent = current + suffix;
      }
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // ── Animated bars (model bars + chart bars) ──
  const barObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !e.target.dataset.animated) {
        e.target.dataset.animated = '1';
        const w = e.target.dataset.width;
        if (w) {
          // Check if this is a vertical bar (inside css-bar-col)
          if (e.target.closest('.css-bar-col')) {
            setTimeout(() => { e.target.style.height = w + '%'; }, 200);
          } else {
            setTimeout(() => { e.target.style.width = w + '%'; }, 200);
          }
        }
      }
    });
  }, { threshold: 0.2, root: landing });
  landing.querySelectorAll('.bar-animated').forEach(el => barObserver.observe(el));

  // ── Donut ring animation ──
  const ringObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !e.target.dataset.animated) {
        e.target.dataset.animated = '1';
        const target = parseFloat(e.target.dataset.target);
        const total = parseFloat(e.target.dataset.total);
        setTimeout(() => {
          e.target.style.strokeDasharray = target + ' ' + total;
        }, 400);
      }
    });
  }, { threshold: 0.3, root: landing });
  landing.querySelectorAll('.donut-ring-animated').forEach(el => ringObserver.observe(el));

  // ── Animated ring (challenge big stat) ──
  const animRingObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !e.target.dataset.animated) {
        e.target.dataset.animated = '1';
        const pct = parseFloat(e.target.dataset.pct) / 100;
        const circumference = 2 * Math.PI * 52; // r=52
        setTimeout(() => {
          e.target.style.strokeDasharray = (pct * circumference) + ' ' + circumference;
        }, 500);
      }
    });
  }, { threshold: 0.3, root: landing });
  landing.querySelectorAll('.animated-ring').forEach(el => animRingObserver.observe(el));

  // ── Hero parallax effect ──
  const heroBg = document.getElementById('heroBgImg');
  if (heroBg) {
    landing.addEventListener('scroll', () => {
      const scrollY = landing.scrollTop;
      if (scrollY < window.innerHeight * 1.2) {
        heroBg.style.transform = 'scale(1.05) translateY(' + (scrollY * 0.3) + 'px)';
      }
    }, { passive: true });
  }

  // ── Floating particles on hero ──
  const particleContainer = document.getElementById('heroParticles');
  if (particleContainer) {
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.style.cssText = `
        position:absolute;
        width:${Math.random() * 3 + 1}px;
        height:${Math.random() * 3 + 1}px;
        background:rgba(255,255,255,${Math.random() * 0.3 + 0.1});
        border-radius:50%;
        left:${Math.random() * 100}%;
        top:${Math.random() * 100}%;
        animation: particle-float ${Math.random() * 10 + 8}s ease-in-out infinite;
        animation-delay: ${Math.random() * -10}s;
      `;
      particleContainer.appendChild(p);
    }
    // Add particle animation keyframes
    if (!document.getElementById('particleStyles')) {
      const style = document.createElement('style');
      style.id = 'particleStyles';
      style.textContent = `
        @keyframes particle-float {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          25% { transform: translate(${20}px, -${30}px) scale(1.2); opacity: 0.6; }
          50% { transform: translate(-${15}px, ${20}px) scale(0.8); opacity: 0.2; }
          75% { transform: translate(${25}px, ${15}px) scale(1.1); opacity: 0.5; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ── Scroll indicator ──
  const scrollInd = document.getElementById('scrollIndicator');
  if (scrollInd) {
    landing.addEventListener('scroll', () => {
      scrollInd.style.opacity = landing.scrollTop > 80 ? '0' : '1';
    }, { passive: true });
  }

  // ── CTA buttons ──
  const heroCta = document.getElementById('heroCta');
  const finalCta = document.getElementById('finalCta');
  if (heroCta) heroCta.addEventListener('click', enterDashboard);
  if (finalCta) finalCta.addEventListener('click', enterDashboard);
}

function enterDashboard() {
  document.getElementById('landingPage').style.display = 'none';
  const app = document.getElementById('appContainer');
  app.style.display = 'block';
  const ticker = document.getElementById('bottomTicker');
  if (ticker) ticker.style.display = '';
  document.body.style.overflow = '';
  window.scrollTo(0, 0);
  initDashboard();
}

// ═══════════════════════════════════════════
// ROUTER / TABS
// ═══════════════════════════════════════════
function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function switchTab(tabId) {
  STATE.currentTab = tabId;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(c => {
    const isActive = c.id === `tab-${tabId}`;
    c.classList.toggle('active', isActive);
    c.style.display = isActive ? '' : 'none';
  });
  if (tabId === 'detail' && !STATE.skuData) loadSKUs();
  if (tabId === 'similarity' && !STATE.simData) loadSimilarity();
  if (tabId === 'pulse' && STATE.pulseSkuList.length === 0) loadPulseSkuList();
  if (tabId === 'forecast') loadForecast();
  if (tabId === 'smart') loadSmart();
}

// ═══════════════════════════════════════════
// DASHBOARD INIT
// ═══════════════════════════════════════════
let dashboardInited = false;

async function initDashboard() {
  if (dashboardInited) return;
  dashboardInited = true;

  initTabs();
  initDarkMode();
  initCommandPalette();
  initExport();
  initSearch();
  initPagination();
  initSegExplain();

  // Nav logo -> landing
  document.getElementById('navLogo').addEventListener('click', () => {
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('landingPage').style.display = '';
    const ticker = document.getElementById('bottomTicker');
    if (ticker) ticker.style.display = 'none';
    window.scrollTo(0, 0);
  });

  try {
    const [cfg, summary, forecastSummary] = await Promise.all([
      api('/api/config'),
      api('/api/summary'),
      api('/api/forecast_summary').catch(() => null)
    ]);
    STATE.config = cfg;
    STATE.summary = summary;
    STATE.forecastSummary = forecastSummary;
    STATE.monthCols = cfg.month_cols || summary.months || [];

    renderSummary(summary, forecastSummary);
    renderDashExtra(summary);
    renderStatHeader(summary);
    renderBottomTicker(summary);
    renderAlerts(summary);
    initSegExplainDash();
    buildStatusFilters(summary);
    buildSegmentFilters(summary);
    await loadSKUs();
  } catch (err) {
    console.error('Dashboard init error:', err);
    // showToast('Error loading dashboard data', 'error');
  }
}

// ═══════════════════════════════════════════
// DASHBOARD: VISUAL SUMMARY CHARTS
// ═══════════════════════════════════════════
function renderSummary(s, fc) {
  const total = s.total_sku || 1;
  const marginal = (s.verdict_counts && s.verdict_counts['Marginal']) || 0;

  // Use forecast pipeline numbers when available
  const can = (fc && fc.active_sku) ? fc.active_sku : (s.can_forecast || 0);
  const cannot = (fc && fc.excluded_sku) ? fc.excluded_sku : (s.cannot_forecast || 0);

  // 1. Hero Metric Cards
  let actCount = 0, endCount = 0, newCount = 0;
  if (s.status_counts) {
    Object.entries(s.status_counts).forEach(([k, v]) => {
      if (k === 'ACT') actCount = v;
      else if (k === 'NEW') newCount = v;
      else endCount += v;
    });
  }
  setText('sumTotal', fmtNum(total));
  setText('sumForecast', fmtNum(can));
  setText('sumNoForecast', fmtNum(cannot));
  setText('sumACT', fmtNum(actCount));
  setText('sumEND', fmtNum(endCount));
  setText('sumNEW', fmtNum(newCount));
  setText('sumVolume', fmtNum(s.total_volume));

  // Animate metric progress bars
  setTimeout(() => {
    setBarWidth('barForecast', can / total * 100);
    setBarWidth('barNoForecast', cannot / total * 100);
    setBarWidth('barACT', actCount / total * 100);
    setBarWidth('barEND', endCount / total * 100);
    setBarWidth('barNEW', newCount / total * 100);
  }, 200);

  // 2. Donut chart — Forecastability (r=54, circumference=339.3)
  const pct = (fc && fc.forecast_ratio) ? fc.forecast_ratio : (can / total * 100);
  const circumference = 2 * Math.PI * 54;
  const dashForecast = (pct / 100) * circumference;
  const donutArc = document.getElementById('donutArc');
  if (donutArc) {
    setTimeout(() => {
      donutArc.setAttribute('stroke-dasharray', `${dashForecast} ${circumference}`);
    }, 150);
  }
  setText('donutPct', pct.toFixed(1) + '%');
  setText('donutBadge', pct.toFixed(1) + '% rate');
  setText('donutYes', fmtNum(can));
  setText('donutNo', fmtNum(cannot));
  setText('donutMarginal', fmtNum(marginal));

  // 3. Segment distribution — stacked bar + detail list
  const segBars = document.getElementById('segBars');
  const segStacked = document.getElementById('segStackedBar');
  if (s.segments) {
    const segShort = { ML_CANDIDATE: 'A', MA3_CANDIDATE: 'B', TOO_SPARSE: 'C', COLD_START: 'D' };
    const segNames = { ML_CANDIDATE: 'ML Candidate', MA3_CANDIDATE: 'MA3 Candidate', TOO_SPARSE: 'Too Sparse', COLD_START: 'Cold Start' };

    // Stacked bar
    if (segStacked) {
      segStacked.innerHTML = s.segments.map(seg => {
        const volPct = seg.vol_pct || 0;
        const color = seg.color || '#6b7280';
        const label = segShort[seg.segment] || seg.segment;
        return `<div class="seg-stack-piece" style="width:${volPct}%;background:${color}" title="${label}: ${volPct.toFixed(1)}%"></div>`;
      }).join('');
    }

    // Volume total
    setText('segTotal', fmtNum(s.total_volume) + ' units');

    // Detail rows
    if (segBars) {
      const maxPct = Math.max(...s.segments.map(seg => seg.vol_pct || 0), 1);
      segBars.innerHTML = s.segments.map(seg => {
        const label = segShort[seg.segment] || seg.segment;
        const name = segNames[seg.segment] || '';
        const volPct = seg.vol_pct || 0;
        const color = seg.color || '#6b7280';
        const count = seg.count || 0;
        const barW = (volPct / maxPct * 100);
        return `<div class="seg-bar-row">
          <span class="seg-bar-dot" style="background:${color}"></span>
          <span class="seg-bar-label">${label}</span>
          <span class="seg-bar-name">${name}</span>
          <div class="seg-bar-track">
            <div class="seg-bar-fill" style="width:0%;background:${color}" data-width="${barW}"></div>
          </div>
          <div class="seg-bar-stats">
            <span class="seg-bar-count">${fmtNum(count)}</span>
            <span class="seg-bar-pct">${volPct.toFixed(1)}%</span>
          </div>
        </div>`;
      }).join('');
      setTimeout(() => {
        segBars.querySelectorAll('.seg-bar-fill').forEach(el => {
          el.style.width = el.dataset.width + '%';
        });
      }, 400);
    }
  }

  // 4. Lifecycle bars
  const lcBars = document.getElementById('lifecycleBars');
  if (lcBars && s.lifecycle_counts) {
    const lcColors = { Growing: '#10b981', Mature: '#3b82f6', Declining: '#f59e0b', Dead: '#ef4444', New: '#8b5cf6' };
    const lcOrder = ['Growing', 'Mature', 'New', 'Declining', 'Dead'];
    const totalLc = Object.values(s.lifecycle_counts).reduce((a, b) => a + b, 0) || 1;
    const maxLc = Math.max(...Object.values(s.lifecycle_counts), 1);
    lcBars.innerHTML = lcOrder.filter(k => s.lifecycle_counts[k]).map(k => {
      const v = s.lifecycle_counts[k];
      const w = (v / maxLc * 100);
      const pctOfTotal = (v / totalLc * 100);
      const color = lcColors[k] || '#6b7280';
      return `<div class="lc-row">
        <span class="lc-dot" style="background:${color}"></span>
        <span class="lc-label">${k}</span>
        <div class="lc-track">
          <div class="lc-fill" style="width:0%;background:${color}" data-width="${w}"></div>
        </div>
        <span class="lc-val">${fmtNum(v)}</span>
        <span class="lc-pct">${pctOfTotal.toFixed(1)}%</span>
      </div>`;
    }).join('');
    setTimeout(() => {
      lcBars.querySelectorAll('.lc-fill').forEach(el => {
        el.style.width = el.dataset.width + '%';
      });
    }, 500);
  }
}

function setBarWidth(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = Math.min(pct, 100) + '%';
}

// ═══════════════════════════════════════════
// STAT HEADER & BOTTOM TICKER
// ═══════════════════════════════════════════
function renderStatHeader(s) {
  setText('shTotal', fmtNum(s.total_sku));
  setText('shForecast', fmtNum(s.can_forecast));
  setText('shNoForecast', fmtNum(s.cannot_forecast));

  let actCount = 0, endCount = 0;
  if (s.status_counts) {
    Object.entries(s.status_counts).forEach(([k, v]) => {
      if (k === 'ACT') actCount = v;
      else if (k !== 'NEW') endCount += v;
    });
  }
  setText('shACT', fmtNum(actCount));
  setText('shEND', fmtNum(endCount));
  setText('shVolume', fmtNum(s.total_volume));

  const rate = s.total_sku > 0 ? ((s.can_forecast / s.total_sku) * 100).toFixed(1) + '%' : '--';
  setText('shRate', rate);
  const tag = document.getElementById('shRateTag');
  if (tag && s.total_sku > 0) {
    const pct = (s.can_forecast / s.total_sku) * 100;
    tag.textContent = pct >= 50 ? 'GOOD' : 'LOW';
    tag.className = 'stat-header-change ' + (pct >= 50 ? 'up' : 'down');
  }
}

function renderBottomTicker(s) {
  const scroll = document.getElementById('tickerScroll');
  if (!scroll) return;

  const segs = s.segments || [];
  const items = segs.map(seg => {
    const key = typeof seg === 'string' ? seg : seg.segment;
    const label = typeof seg === 'string' ? seg : (seg.label || seg.segment);
    const count = typeof seg === 'string' ? 0 : (seg.count || 0);
    const color = typeof seg === 'string' ? '#6b7280' : (seg.color || '#6b7280');
    const volPct = typeof seg === 'string' ? '' : (seg.vol_pct != null ? seg.vol_pct.toFixed(1) + '%' : '');
    return `<div class="ticker-item">
      <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0"></span>
      <span class="ticker-seg-name">${label}</span>
      <span class="ticker-seg-count">${fmtNum(count)}</span>
      ${volPct ? `<span class="ticker-seg-pct">${volPct}</span>` : ''}
    </div>`;
  }).join('');

  scroll.innerHTML = items + items; // duplicate for seamless scroll

  // Update time
  const timeEl = document.getElementById('tickerTime');
  if (timeEl) {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
}

function renderAlerts(s) {
  let inactive = 0, stillSelling = 0;
  const total = s.total_sku || 1;
  if (s.activity_counts) {
    inactive = s.activity_counts['Inactive'] || s.activity_counts['ACT+Inactive'] || 0;
    stillSelling = s.activity_counts['StillSelling'] || s.activity_counts['END+StillSelling'] || 0;
  }
  setText('alertInactiveCount', fmtNum(inactive));
  setText('alertStillSellingCount', fmtNum(stillSelling));

  // Animate ring gauges (circumference = 2 * PI * 24 = 150.8)
  const circ = 2 * Math.PI * 24;
  setTimeout(() => {
    const ringInactive = document.getElementById('ringInactive');
    if (ringInactive) {
      const dash = (inactive / total) * circ;
      ringInactive.setAttribute('stroke-dasharray', `${dash} ${circ}`);
    }
    const ringStill = document.getElementById('ringStillSelling');
    if (ringStill) {
      const dash = (stillSelling / total) * circ;
      ringStill.setAttribute('stroke-dasharray', `${dash} ${circ}`);
    }
  }, 600);

  const alertInactive = document.getElementById('alertInactive');
  const alertStillSelling = document.getElementById('alertStillSelling');
  if (alertInactive) {
    alertInactive.addEventListener('click', () => {
      switchTab('detail');
      setTimeout(() => setFilter('activity_label', 'Inactive'), 100);
    });
  }
  if (alertStillSelling) {
    alertStillSelling.addEventListener('click', () => {
      switchTab('detail');
      setTimeout(() => setFilter('activity_label', 'StillSelling'), 100);
    });
  }
}

// ═══════════════════════════════════════════
// DASHBOARD: EXTRA CHARTS (Row 3 & 4)
// ═══════════════════════════════════════════
function renderDashExtra(s) {
  const total = s.total_sku || 1;

  // Helper: build SVG multi-segment donut
  function buildDonut(containerId, items, centerText, centerSub, gradients) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const R = 52, SW = 14, C = 2 * Math.PI * R;
    const totalVal = items.reduce((a, b) => a + b.value, 0) || 1;
    let offset = 0;
    const arcs = items.map((item, i) => {
      const pct = item.value / totalVal;
      const dash = pct * C;
      const gap = C - dash;
      const rot = offset * 360 - 90;
      offset += pct;
      const gradId = containerId + '_g' + i;
      return { ...item, dash, gap, rot, pct, gradId };
    });

    const gradDefs = arcs.map(a => {
      const c2 = a.color2 || a.color;
      return `<linearGradient id="${a.gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${a.color}"/><stop offset="100%" stop-color="${c2}"/>
      </linearGradient>`;
    }).join('');

    const arcSvg = arcs.map(a =>
      `<circle cx="70" cy="70" r="${R}" fill="none" stroke="url(#${a.gradId})" stroke-width="${SW}"
        stroke-dasharray="0 ${C}" stroke-linecap="round"
        transform="rotate(${a.rot} 70 70)" data-dash="${a.dash}" data-gap="${a.gap}"
        class="donut-seg-arc" style="filter:drop-shadow(0 0 6px ${a.color}40)"/>`
    ).join('');

    const legend = arcs.map(a =>
      `<div class="donut-leg-row">
        <span class="donut-leg-dot" style="background:${a.color};box-shadow:0 0 8px ${a.color}60"></span>
        <span class="donut-leg-name">${a.label}</span>
        <span class="donut-leg-val">${fmtNum(a.value)}</span>
        <span class="donut-leg-pct">${(a.pct * 100).toFixed(1)}%</span>
      </div>`
    ).join('');

    el.innerHTML = `
      <div class="donut-mini-wrap">
        <svg viewBox="0 0 140 140" class="donut-mini-svg">
          <circle cx="70" cy="70" r="${R}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${SW}"/>
          <defs>${gradDefs}</defs>
          ${arcSvg}
        </svg>
        <div class="donut-mini-center">
          <span class="donut-mini-val">${centerText}</span>
          <span class="donut-mini-sub">${centerSub}</span>
        </div>
      </div>
      <div class="donut-mini-legend">${legend}</div>`;

    // Animate arcs
    setTimeout(() => {
      el.querySelectorAll('.donut-seg-arc').forEach(arc => {
        arc.setAttribute('stroke-dasharray', `${arc.dataset.dash} ${arc.dataset.gap}`);
      });
    }, 300);
  }

  // 1. Verdict SVG donut
  if (s.verdict_counts) {
    const vItems = [
      { label: 'Forecastable', value: s.verdict_counts.Forecastable || 0, color: '#10b981', color2: '#14b8a6' },
      { label: 'Marginal', value: s.verdict_counts.Marginal || 0, color: '#f59e0b', color2: '#fbbf24' },
      { label: 'Not Forecast', value: s.verdict_counts.Not_Forecastable || 0, color: '#ef4444', color2: '#f87171' }
    ].filter(i => i.value > 0);
    const fPct = ((s.verdict_counts.Forecastable || 0) / total * 100).toFixed(0);
    const badge = document.getElementById('verdictBadge');
    if (badge) badge.textContent = fPct + '% OK';
    buildDonut('verdictDonut', vItems, fPct + '%', 'forecast', true);
  }

  // 2. Activity donut — aggregate to main categories
  if (s.activity_counts) {
    const agg = { Active: 0, Inactive: 0, StillSelling: 0, Discontinued: 0 };
    Object.entries(s.activity_counts).forEach(([k, v]) => {
      // Keys are like "ACT+Active", "END+Discontinued", "HÀNG CT+Inactive", etc.
      const parts = k.split('+');
      const activity = parts.length > 1 ? parts[parts.length - 1] : k;
      if (activity === 'Active') agg.Active += v;
      else if (activity === 'Inactive') agg.Inactive += v;
      else if (activity === 'StillSelling') agg.StillSelling += v;
      else if (activity === 'Discontinued') agg.Discontinued += v;
    });
    const aItems = [
      { label: 'Active', value: agg.Active, color: '#10b981', color2: '#34d399' },
      { label: 'Inactive', value: agg.Inactive, color: '#f59e0b', color2: '#fcd34d' },
      { label: 'Still Selling', value: agg.StillSelling, color: '#ef4444', color2: '#fb7185' },
      { label: 'Discontinued', value: agg.Discontinued, color: '#8b5cf6', color2: '#a78bfa' }
    ].filter(i => i.value > 0);
    const actTotal = aItems.reduce((a, b) => a + b.value, 0);
    const actPct = actTotal > 0 ? ((agg.Active / actTotal) * 100).toFixed(0) : '0';
    buildDonut('activityDonut', aItems, actPct + '%', 'active', true);
  }

  // 3. Status donut — aggregate END-* into END
  if (s.status_counts) {
    let actCount = 0, endCount = 0, newCount = 0, otherCount = 0;
    Object.entries(s.status_counts).forEach(([k, v]) => {
      const ku = k.toUpperCase();
      if (ku === 'ACT') actCount += v;
      else if (ku.startsWith('END')) endCount += v;
      else if (ku === 'NEW') newCount += v;
      else otherCount += v;
    });
    const sItems = [
      { label: 'ACT', value: actCount, color: '#0ea5e9', color2: '#38bdf8' },
      { label: 'END', value: endCount, color: '#ef4444', color2: '#fb7185' },
      { label: 'NEW', value: newCount, color: '#8b5cf6', color2: '#a78bfa' }
    ];
    if (otherCount > 0) sItems.push({ label: 'Kh\u00e1c', value: otherCount, color: '#64748b', color2: '#94a3b8' });
    const validItems = sItems.filter(i => i.value > 0);
    const stTotal = validItems.reduce((a, b) => a + b.value, 0);
    const actPctS = stTotal > 0 ? ((actCount / stTotal) * 100).toFixed(0) : '0';
    buildDonut('statusDonut', validItems, actPctS + '%', 'ACT', true);
  }

  // 4. Quality gauges
  const qualStats = document.getElementById('qualityStats');
  if (qualStats) {
    const can = s.can_forecast || 0;
    const forecastRate = (can / total * 100);
    const sparsePct = s.avg_sparsity != null ? Number(s.avg_sparsity).toFixed(1) : '60.0';
    const segCount = s.segments ? s.segments.length : 6;
    const dataMonths = s.data_months || 31;

    function miniGauge(pct, color, color2) {
      const R = 28, SW = 6, C = Math.PI * R; // semicircle
      const fill = (pct / 100) * C;
      return `<svg viewBox="0 0 70 40" class="quality-gauge-svg">
        <path d="M 7 35 A 28 28 0 0 1 63 35" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${SW}" stroke-linecap="round"/>
        <path d="M 7 35 A 28 28 0 0 1 63 35" fill="none" stroke="url(#qg_${color.replace('#','')})" stroke-width="${SW}" stroke-linecap="round"
          stroke-dasharray="0 ${C}" data-dash="${fill}" data-gap="${C - fill}" class="gauge-arc"
          style="filter:drop-shadow(0 0 4px ${color}80)"/>
        <defs><linearGradient id="qg_${color.replace('#','')}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="${color2}"/>
        </linearGradient></defs>
      </svg>`;
    }

    const items = [
      { label: 'Forecast rate', val: forecastRate.toFixed(1) + '%', pct: forecastRate, color: '#10b981', color2: '#14b8a6',
        tag: forecastRate >= 40 ? 'T\u1ed1t' : forecastRate >= 25 ? 'TB' : 'Th\u1ea5p',
        cls: forecastRate >= 40 ? 'good' : forecastRate >= 25 ? 'warn' : 'bad' },
      { label: 'Sparsity', val: sparsePct + '%', pct: Math.min(Number(sparsePct), 100), color: '#f59e0b', color2: '#fcd34d',
        tag: Number(sparsePct) <= 40 ? 'T\u1ed1t' : Number(sparsePct) <= 60 ? 'TB' : 'Cao',
        cls: Number(sparsePct) <= 40 ? 'good' : Number(sparsePct) <= 60 ? 'warn' : 'bad' },
      { label: 'D\u1eef li\u1ec7u', val: dataMonths + ' th\u00e1ng', pct: Math.min(dataMonths / 36 * 100, 100), color: '#0ea5e9', color2: '#38bdf8',
        tag: dataMonths >= 24 ? '\u0110\u1ee7' : '\u00cdt',
        cls: dataMonths >= 24 ? 'good' : 'warn' },
      { label: 'Ph\u00e2n kh\u00fac', val: segCount, pct: Math.min(segCount / 8 * 100, 100), color: '#8b5cf6', color2: '#a78bfa',
        tag: 'OK', cls: 'good' }
    ];

    qualStats.innerHTML = items.map(it => `
      <div class="quality-gauge-item">
        ${miniGauge(it.pct, it.color, it.color2)}
        <div class="quality-gauge-info">
          <span class="quality-gauge-val">${it.val}</span>
          <span class="quality-gauge-label">${it.label}</span>
        </div>
        <span class="quality-tag ${it.cls}">${it.tag}</span>
      </div>
    `).join('');

    // Animate gauge arcs
    setTimeout(() => {
      qualStats.querySelectorAll('.gauge-arc').forEach(arc => {
        arc.setAttribute('stroke-dasharray', `${arc.dataset.dash} ${arc.dataset.gap}`);
      });
    }, 500);
  }
}

// Dashboard Segment Explain (separate from detail tab)
function initSegExplainDash() {
  const btn = document.getElementById('segExplainBtnDash');
  const panel = document.getElementById('segExplainPanelDash');
  if (!btn || !panel) return;

  btn.addEventListener('click', async () => {
    const isOpen = panel.style.display !== 'none';
    btn.classList.toggle('open', !isOpen);
    if (!isOpen) {
      panel.style.display = '';
      if (!STATE.segExplainData) {
        try {
          STATE.segExplainData = await api('/api/segment_explain');
        } catch (err) {
          panel.innerHTML = '<div style="padding:20px;color:var(--text-3)">Error loading segment data</div>';
          return;
        }
      }
      // Render into dash panel
      const segOrder = ['ML_CANDIDATE', 'MA3_CANDIDATE', 'TOO_SPARSE', 'COLD_START'];
      const entries = segOrder.filter(s => STATE.segExplainData[s]).map(s => [s, STATE.segExplainData[s]]);
      panel.innerHTML = entries.map(([seg, info]) => {
        const color = CONFIG.SEGMENT_COLORS[seg] || '#6b7280';
        const stats = info.stats || {};
        const criteria = (info.criteria || []).map(c => `<li>${c}</li>`).join('');
        const canFc = info.can_forecast ? '<span style="color:#10b981;font-weight:600">&#10003; Forecast được</span>' : '<span style="color:#ef4444;font-weight:600">&#10007; Không đủ data forecast</span>';
        return `<div class="seg-explain-card" style="border-left-color:${color}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <h4 style="margin:0">${info.icon || ''} ${info.title || seg}</h4>
            ${canFc}
          </div>
          <div class="seg-ex-stats">${fmtNum(stats.count || 0)} SKUs &middot; ${(stats.vol_pct || 0).toFixed(1)}% volume${stats.routing ? ' &middot; Routing: ' + stats.routing : ''}</div>
          <div style="margin:8px 0 6px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Tiêu chí phân loại:</div>
          <ul style="margin:0 0 8px;padding-left:18px;color:#cbd5e1;font-size:12px;line-height:1.7">${criteria}</ul>
          <div class="seg-ex-model" style="color:#60a5fa;font-size:12px"><b>Model:</b> ${info.model || '-'}</div>
          <div class="seg-ex-why" style="color:#94a3b8;font-size:12px;margin-top:4px"><b>Chiến lược:</b> ${info.action || info.why || ''}</div>
          ${info.note ? '<div style="color:#475569;font-size:11px;margin-top:4px;font-style:italic">' + info.note + '</div>' : ''}
        </div>`;
      }).join('');
    } else {
      panel.style.display = 'none';
    }
  });
}

// ═══════════════════════════════════════════
// DASHBOARD: FILTERS
// ═══════════════════════════════════════════
function buildStatusFilters(summary) {
  const container = document.getElementById('filterStatus');
  container.innerHTML = '<button class="pill active" data-value="">All</button>';
  if (summary.status_counts) {
    const statuses = Object.keys(summary.status_counts).sort();
    statuses.forEach(st => {
      const btn = document.createElement('button');
      btn.className = 'pill';
      btn.dataset.value = st;
      btn.textContent = st;
      container.appendChild(btn);
    });
  }
  bindPills(container, 'status');
}

function buildSegmentFilters(summary) {
  const container = document.getElementById('filterSegment');
  container.innerHTML = '<button class="pill active" data-value="">All</button>';
  const segs = summary.segments || (STATE.config && STATE.config.segment_order) || [];
  segs.forEach(seg => {
    const key = typeof seg === 'string' ? seg : seg.segment;
    const label = typeof seg === 'string' ? seg : (seg.label || seg.segment);
    const color = typeof seg === 'string' ? '' : (seg.color || '');
    const count = typeof seg === 'string' ? '' : (seg.count || '');
    const btn = document.createElement('button');
    btn.className = 'pill';
    btn.dataset.value = key;
    btn.innerHTML = (color ? `<span style="color:${color};font-weight:700">&#9679;</span> ` : '') + label + (count ? ` <span style="color:var(--text-muted);font-size:10px">${Number(count).toLocaleString()}</span>` : '');
    container.appendChild(btn);
  });
  bindPills(container, 'segment');

  // Also bind existing pills
  bindPills(document.getElementById('filterActivity'), 'activity_label');
  bindPills(document.getElementById('filterLifecycle'), 'lifecycle_stage');
  bindPills(document.getElementById('filterVerdict'), 'verdict');
  bindPills(document.getElementById('filterForecast'), 'can_forecast');

  // Pulse segment filter
  const pulseSeg = document.getElementById('pulseSegFilter');
  if (pulseSeg) segs.forEach(seg => {
    const key = typeof seg === 'string' ? seg : seg.segment;
    const label = typeof seg === 'string' ? seg : (seg.label || seg.segment);
    const btn = document.createElement('button');
    btn.className = 'pill small';
    btn.dataset.seg = key;
    btn.textContent = label;
    pulseSeg.appendChild(btn);
  });
}

function bindPills(container, filterKey) {
  container.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    container.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    STATE.filters[filterKey] = pill.dataset.value;
    STATE.filters.page = 1;
    loadSKUs();
    renderFilterChips();
  });
}

function setFilter(key, value) {
  STATE.filters[key] = value;
  STATE.filters.page = 1;
  // Update pill UI
  const mapping = {
    status: 'filterStatus', activity_label: 'filterActivity',
    lifecycle_stage: 'filterLifecycle', verdict: 'filterVerdict',
    segment: 'filterSegment', can_forecast: 'filterForecast'
  };
  const containerId = mapping[key];
  if (containerId) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('.pill').forEach(p => {
      p.classList.toggle('active', p.dataset.value === value);
    });
  }
  loadSKUs();
  renderFilterChips();
}

function renderFilterChips() {
  const container = document.getElementById('filterChips');
  container.innerHTML = '';
  const labels = {
    status: 'Status', activity_label: 'Activity', lifecycle_stage: 'Lifecycle',
    verdict: 'Verdict', segment: 'Segment', can_forecast: 'Forecast', search: 'Search'
  };
  Object.entries(labels).forEach(([key, label]) => {
    const val = STATE.filters[key];
    if (!val) return;
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    const displayVal = key === 'can_forecast' ? (val === '1' ? 'Yes' : 'No') : val;
    chip.innerHTML = `${label}: <strong>${displayVal}</strong> <span class="chip-remove" data-key="${key}">&times;</span>`;
    container.appendChild(chip);
  });
  container.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      setFilter(btn.dataset.key, '');
    });
  });
}

// ═══════════════════════════════════════════
// DASHBOARD: TABLE
// ═══════════════════════════════════════════
const FIXED_COLS = [
  { key: 'sku', label: 'SKU', sortable: true },
  { key: 'product_name', label: 'Product', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'fsku', label: 'F_SKU', sortable: true },
  { key: 'segment', label: 'Segment', sortable: true },
  { key: 'can_forecast', label: 'Forecast', sortable: true },
  { key: 'activity_label', label: 'Activity', sortable: true },
  { key: 'lifecycle_stage', label: 'Lifecycle', sortable: true },
  { key: 'verdict', label: 'Verdict', sortable: true },
  { key: 'forecastability_score', label: 'Score', sortable: true },
  { key: 'recommended_method', label: 'Method', sortable: true },
  { key: 'total_qty', label: 'Total Qty', sortable: true },
  { key: 'n_months_active', label: 'Active Mo.', sortable: true },
  { key: 'sparsity_pct', label: 'Sparsity%', sortable: true },
  { key: 'cv', label: 'CV', sortable: true },
  { key: 'ADI', label: 'ADI', sortable: true },
  { key: 'SB_class', label: 'SB Class', sortable: true },
  { key: 'n_unique_customers', label: 'Customers', sortable: true },
  { key: 'first_sale', label: 'First Sale', sortable: true },
  { key: 'last_sale', label: 'Last Sale', sortable: true }
];

async function loadSKUs() {
  showTableLoading(true);
  try {
    const data = await api('/api/skus', STATE.filters);
    STATE.skuData = data;
    STATE.monthCols = data.months || STATE.monthCols;
    renderTable(data);
    renderPagination(data);
  } catch (err) {
    console.error('Load SKUs error:', err);
    showToast('Error loading SKU data', 'error');
  } finally {
    showTableLoading(false);
  }
}

function renderTable(data) {
  const thead = document.getElementById('dataTableHead');
  const tbody = document.getElementById('dataTableBody');

  // Header
  let headerHtml = '<tr>';
  FIXED_COLS.forEach(col => {
    const sorted = STATE.filters.sort_by === col.key;
    const arrow = sorted ? (STATE.filters.sort_dir === 'asc' ? '&#9650;' : '&#9660;') : '&#9650;';
    const cls = sorted ? 'sorted' : '';
    headerHtml += `<th class="${cls}" data-sort="${col.key}">${col.label} <span class="sort-arrow">${arrow}</span></th>`;
  });
  (STATE.monthCols || []).forEach(m => {
    const label = m.replace(/^20/, '').replace('-', '/');
    headerHtml += `<th class="qty-cell" data-sort="">${label}</th>`;
  });
  headerHtml += '</tr>';
  thead.innerHTML = headerHtml;

  // Bind sorting
  thead.querySelectorAll('th[data-sort]').forEach(th => {
    const sortKey = th.dataset.sort;
    if (!sortKey) return;
    th.addEventListener('click', () => {
      if (STATE.filters.sort_by === sortKey) {
        STATE.filters.sort_dir = STATE.filters.sort_dir === 'asc' ? 'desc' : 'asc';
      } else {
        STATE.filters.sort_by = sortKey;
        STATE.filters.sort_dir = 'desc';
      }
      STATE.filters.page = 1;
      loadSKUs();
    });
  });

  // Body
  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${FIXED_COLS.length + STATE.monthCols.length}" style="text-align:center;padding:40px;color:var(--text-muted)">Kh&ocirc;ng c&oacute; d&#7919; li&#7879;u</td></tr>`;
    return;
  }

  let bodyHtml = '';
  data.rows.forEach(row => {
    bodyHtml += '<tr>';
    FIXED_COLS.forEach(col => {
      bodyHtml += `<td>${renderCell(col.key, row)}</td>`;
    });
    const monthly = row.monthly || {};
    (STATE.monthCols || []).forEach(m => {
      const val = monthly[m] || 0;
      const cls = val === 0 ? 'qty-cell zero' : (val >= 1000 ? 'qty-cell high' : 'qty-cell');
      bodyHtml += `<td class="${cls}">${val > 0 ? fmtNum(val) : '-'}</td>`;
    });
    bodyHtml += '</tr>';
  });
  tbody.innerHTML = bodyHtml;

  // Bind SKU links for pulse
  tbody.querySelectorAll('.sku-link').forEach(link => {
    link.addEventListener('click', () => {
      const sku = link.dataset.sku;
      const name = link.dataset.name || sku;
      const seg = link.dataset.seg || '';
      addPulseSku({ sku, product_name: name, segment: seg });
      switchTab('pulse');
    });
  });
}

function renderCell(key, row) {
  const val = row[key];
  switch (key) {
    case 'sku':
      return `<span class="sku-link" data-sku="${val}" data-name="${esc(row.product_name || '')}" data-seg="${row.segment || ''}">${val}</span>`;
    case 'product_name':
      return `<span title="${esc(val || '')}">${esc((val || '').substring(0, 40))}</span>`;
    case 'status': {
      const s = (val || '').toUpperCase();
      const cls = s === 'ACT' ? 'badge-act' : s === 'NEW' ? 'badge-new' : 'badge-end';
      return `<span class="badge ${cls}">${val || '-'}</span>`;
    }
    case 'segment': {
      const segMap = {'ML_CANDIDATE':'a','MA3_CANDIDATE':'b','TOO_SPARSE':'c','COLD_START':'d'};
      const code = segMap[val] || val?.charAt(0)?.toLowerCase() || '';
      const label = STATE.config?.segment_labels?.[val] || val || '-';
      return `<span class="badge badge-seg-${code}">${label}</span>`;
    }
    case 'can_forecast': {
      const isYes = typeof val === 'string' && val.toLowerCase().startsWith('yes');
      return isYes ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>';
    }
    case 'total_qty':
    case 'n_unique_customers':
      return fmtNum(val || 0);
    case 'forecastability_score':
    case 'sparsity_pct':
      return val != null ? Number(val).toFixed(1) : '-';
    case 'cv':
    case 'ADI':
      return val != null ? Number(val).toFixed(2) : '-';
    default:
      return val != null ? val : '-';
  }
}

function showTableLoading(show) {
  const el = document.getElementById('tableLoading');
  el.classList.toggle('hidden', !show);
}

// ═══════════════════════════════════════════
// DASHBOARD: PAGINATION
// ═══════════════════════════════════════════
function initPagination() {
  document.getElementById('prevPage').addEventListener('click', () => {
    if (STATE.filters.page > 1) { STATE.filters.page--; loadSKUs(); }
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    if (STATE.skuData && STATE.filters.page < Math.ceil(STATE.skuData.total / STATE.filters.per_page)) {
      STATE.filters.page++; loadSKUs();
    }
  });
  document.getElementById('perPageSelect').addEventListener('change', (e) => {
    STATE.filters.per_page = parseInt(e.target.value);
    STATE.filters.page = 1;
    loadSKUs();
  });
}

function renderPagination(data) {
  const total = data.total || 0;
  const pp = STATE.filters.per_page;
  const pages = Math.ceil(total / pp) || 1;
  const page = data.page || STATE.filters.page;

  const start = total > 0 ? (page - 1) * pp + 1 : 0;
  const end = Math.min(page * pp, total);
  setText('pageInfo', `${fmtNum(start)}-${fmtNum(end)} / ${fmtNum(total)} SKU`);
  setText('pageNum', `${page} / ${pages}`);

  document.getElementById('prevPage').disabled = page <= 1;
  document.getElementById('nextPage').disabled = page >= pages;
}

// ═══════════════════════════════════════════
// DASHBOARD: SIMILARITY
// ═══════════════════════════════════════════
async function loadSimilarity() {
  try {
    const data = await api('/api/similarity', STATE.simFilters);
    STATE.simData = data;
    renderSimCounts(data);
    renderSimGrid(data);
    renderSimPagination(data);
  } catch (err) {
    console.error('Load similarity error:', err);
    showToast('Error loading similarity data', 'error');
  }
}

function renderSimCounts(data) {
  const container = document.getElementById('simCounts');
  if (!data.method_counts) { container.innerHTML = ''; return; }
  container.innerHTML = Object.entries(data.method_counts)
    .map(([m, c]) => `<span class="sim-count-badge"><strong>${fmtNum(c)}</strong> ${m}</span>`)
    .join('');
}

function renderSimGrid(data) {
  const grid = document.getElementById('simGrid');
  if (!data.rows || data.rows.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Kh&ocirc;ng c&oacute; nh&oacute;m n&agrave;o</div>';
    return;
  }
  grid.innerHTML = data.rows.map(row => {
    const skus = row.sku_details || row.skus || [];
    const skuChips = (Array.isArray(skus) ? skus : []).slice(0, 10).map(s => {
      const sk = typeof s === 'string' ? s : (s.sku || '');
      const seg = typeof s === 'object' ? (s.segment || '') : '';
      const col = CONFIG.SEGMENT_COLORS[seg.replace('Seg_','')] || '#6b7280';
      return `<span class="sim-sku-chip"><span class="sku-seg" style="background:${col}"></span>${sk}</span>`;
    }).join('');
    const total = row.n_members || row.n_skus || (Array.isArray(skus) ? skus.length : 0);
    const extra = total > 10 ? `<span class="sim-sku-chip">+${total - 10} more</span>` : '';
    return `
      <div class="sim-card">
        <div class="sim-card-header">
          <span class="sim-card-title">${esc(row.fsku_name || row.group_id || '')}</span>
          <span class="sim-card-method">${row.method || ''}</span>
        </div>
        <div class="sim-card-reason">${esc(row.reason || '')} &middot; ${total} SKUs</div>
        <div class="sim-card-skus">${skuChips}${extra}</div>
      </div>`;
  }).join('');
}

function renderSimPagination(data) {
  const total = data.total || 0;
  const pp = STATE.simFilters.per_page;
  const pages = Math.ceil(total / pp) || 1;
  const page = data.page || 1;
  setText('simPageNum', `${page} / ${pages}`);
  document.getElementById('simPrevPage').disabled = page <= 1;
  document.getElementById('simNextPage').disabled = page >= pages;
}

function initSimilarityControls() {
  document.getElementById('simMethodPills').addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#simMethodPills .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    STATE.simFilters.method = pill.dataset.method;
    STATE.simFilters.page = 1;
    loadSimilarity();
  });

  let simTimeout;
  document.getElementById('simSearch').addEventListener('input', (e) => {
    clearTimeout(simTimeout);
    simTimeout = setTimeout(() => {
      STATE.simFilters.search = e.target.value;
      STATE.simFilters.page = 1;
      loadSimilarity();
    }, CONFIG.DEBOUNCE_MS);
  });

  document.getElementById('simPrevPage').addEventListener('click', () => {
    if (STATE.simFilters.page > 1) { STATE.simFilters.page--; loadSimilarity(); }
  });
  document.getElementById('simNextPage').addEventListener('click', () => {
    if (STATE.simData && STATE.simFilters.page < Math.ceil(STATE.simData.total / STATE.simFilters.per_page)) {
      STATE.simFilters.page++; loadSimilarity();
    }
  });
}
// Init similarity controls immediately (they exist in DOM)
document.addEventListener('DOMContentLoaded', () => {
  initSimilarityControls();
});

// ═══════════════════════════════════════════
// DASHBOARD: PULSE CHART
// ═══════════════════════════════════════════
async function loadPulseSkuList() {
  try {
    const data = await api('/api/sku_search', { q: STATE.pulseSearch, segment: STATE.pulseSeg, limit: 200 });
    STATE.pulseSkuList = data.results || [];
    renderPulseSkuList();
  } catch (err) {
    console.error('Pulse SKU list error:', err);
  }
}

function renderPulseSkuList() {
  const list = document.getElementById('pulseSkuList');
  const selectedSkus = new Set(STATE.pulseSelected.map(s => s.sku));
  list.innerHTML = STATE.pulseSkuList.map(s => {
    const seg = (s.segment || '').replace('Seg_', '');
    const col = CONFIG.SEGMENT_COLORS[seg] || '#6b7280';
    const sel = selectedSkus.has(s.sku) ? 'selected' : '';
    return `<div class="pulse-sku-item ${sel}" data-sku="${s.sku}" data-name="${esc(s.product_name || '')}" data-seg="${s.segment || ''}">
      <span class="pulse-sku-dot" style="background:${col}"></span>
      <span class="pulse-sku-name" title="${esc(s.product_name || '')}">${s.sku}</span>
      <span class="pulse-sku-qty">${fmtNum(s.total_qty || 0)}</span>
    </div>`;
  }).join('');

  list.querySelectorAll('.pulse-sku-item').forEach(item => {
    item.addEventListener('click', () => {
      const sku = item.dataset.sku;
      if (selectedSkus.has(sku)) {
        removePulseSku(sku);
      } else {
        addPulseSku({ sku, product_name: item.dataset.name, segment: item.dataset.seg });
      }
    });
  });
}

function addPulseSku(skuObj) {
  if (STATE.pulseSelected.length >= CONFIG.MAX_PULSE_SKUS) {
    showToast(`Maximum ${CONFIG.MAX_PULSE_SKUS} SKU`, 'info');
    return;
  }
  if (STATE.pulseSelected.find(s => s.sku === skuObj.sku)) return;
  STATE.pulseSelected.push(skuObj);
  renderPulseSelected();
  renderPulseSkuList();
  loadPulseChartData(skuObj.sku);
}

function removePulseSku(sku) {
  STATE.pulseSelected = STATE.pulseSelected.filter(s => s.sku !== sku);
  delete STATE.pulseChartData[sku];
  renderPulseSelected();
  renderPulseSkuList();
  renderPulseChart();
}

function renderPulseSelected() {
  setText('pulseCount', STATE.pulseSelected.length);
  const chips = document.getElementById('pulseChips');
  chips.innerHTML = STATE.pulseSelected.map((s, i) => {
    const col = CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length];
    return `<span class="pulse-chip" style="border-color:${col}">
      <span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0"></span>
      ${s.sku}
      <span class="pulse-chip-remove" data-sku="${s.sku}">&times;</span>
    </span>`;
  }).join('');
  chips.querySelectorAll('.pulse-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => removePulseSku(btn.dataset.sku));
  });
}

async function loadPulseChartData(sku) {
  try {
    const data = await api('/api/sku_chart', { sku });
    STATE.pulseChartData[sku] = {
      monthly: data.monthly || [],
      forecast: data.forecast || [],
      accuracy: data.accuracy || {},
    };
    renderPulseChart();
  } catch (err) {
    console.error('Pulse chart data error:', err);
  }
}

function _toChartTime(dateStr) {
  // Return YYYY-MM-DD string for LightweightCharts v4 (UTCTimestamp string)
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.substring(0, 10); // "2023-01-01"
}

function renderPulseChart() {
  const container = document.getElementById('pulseChartContainer');
  const legend = document.getElementById('pulseLegend');

  if (STATE.pulseSelected.length === 0) {
    container.innerHTML = '<div class="pulse-placeholder">Ch&#7885;n SKU t&#7915; danh s&aacute;ch b&ecirc;n tr&aacute;i &#273;&#7875; xem bi&#7875;u &#273;&#7891;</div>';
    legend.innerHTML = '';
    if (STATE.pulseChart) { try { STATE.pulseChart.remove(); } catch(e){} STATE.pulseChart = null; }
    return;
  }

  // Remove old chart BEFORE clearing container
  if (STATE.pulseChart) { try { STATE.pulseChart.remove(); } catch(e){} STATE.pulseChart = null; }
  container.innerHTML = '';

  const w = container.clientWidth || 800;
  const h = container.clientHeight || 500;

  STATE.pulseChart = LightweightCharts.createChart(container, {
    width: w,
    height: h,
    layout: {
      background: { type: 'solid', color: '#1a1d23' },
      textColor: '#9ca3af',
      fontFamily: "'Inter', sans-serif"
    },
    grid: {
      vertLines: { color: '#2c313b' },
      horzLines: { color: '#2c313b' }
    },
    rightPriceScale: { borderColor: '#2c313b' },
    timeScale: { borderColor: '#2c313b', timeVisible: false }
  });

  STATE.pulseSeries = [];
  STATE.pulseSelected.forEach((skuObj, i) => {
    const color = CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length];
    const skuData = STATE.pulseChartData[skuObj.sku] || {};

    const monthly = Array.isArray(skuData) ? skuData : (skuData.monthly || []);
    const forecast = Array.isArray(skuData) ? [] : (skuData.forecast || []);

    // Actual history series — use unix timestamps for reliable rendering
    const actualSeries = STATE.pulseChart.addLineSeries({
      color,
      lineWidth: 2,
      title: skuObj.sku,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const actualData = monthly.map(m => ({
      time: _toChartTime(m.time || m.month),
      value: (m.value != null ? m.value : (m.qty != null ? m.qty : 0))
    })).filter(d => d.time != null)
      .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    console.log('[Pulse]', skuObj.sku, 'actual:', actualData.length, 'pts, first:', actualData[0], 'last:', actualData[actualData.length-1]);
    if (actualData.length > 0) actualSeries.setData(actualData);
    STATE.pulseSeries.push(actualSeries);

    // Forecast series (dashed line)
    if (forecast.length > 0) {
      const lastActual = actualData.length > 0 ? actualData[actualData.length - 1] : null;
      const forecastData = forecast.map(m => ({
        time: _toChartTime(m.time || m.month),
        value: (m.value != null ? m.value : 0)
      })).filter(d => d.time != null && !isNaN(d.time))
        .sort((a, b) => a.time - b.time);

      const bridgedForecast = [];
      if (lastActual) bridgedForecast.push({ time: lastActual.time, value: lastActual.value });
      bridgedForecast.push(...forecastData);

      const fcSeries = STATE.pulseChart.addLineSeries({
        color,
        lineWidth: 2,
        lineStyle: 2,
        title: skuObj.sku + ' (FC)',
        priceLineVisible: false,
        lastValueVisible: false,
      });
      fcSeries.setData(bridgedForecast);
      STATE.pulseSeries.push(fcSeries);
    }
  });

  STATE.pulseChart.timeScale().fitContent();

  // ResizeObserver for responsive
  const ro = new ResizeObserver(() => {
    if (STATE.pulseChart) STATE.pulseChart.resize(container.clientWidth, container.clientHeight || 500);
  });
  ro.observe(container);

  // Legend — show actual (solid) + forecast (dashed) indicator, plus accuracy
  legend.innerHTML = STATE.pulseSelected.map((s, i) => {
    const col = CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length];
    const skuData = STATE.pulseChartData[s.sku] || {};
    const acc = (Array.isArray(skuData) ? {} : (skuData.accuracy || {}));
    const hasForecast = !Array.isArray(skuData) && (skuData.forecast || []).length > 0;
    const accLabel = acc.method_used ? ` · ${acc.method_used}` : (acc.accuracy_tier ? ` · ${acc.accuracy_tier}` : '');
    const accPct = acc.test_accuracy != null ? acc.test_accuracy : (acc.wmape != null ? (acc.wmape > 1 ? (100 - acc.wmape * 100) : (100 - acc.wmape * 100)) : null);
    const wmapeLabel = accPct != null ? ` · Acc ${accPct.toFixed(1)}%` : '';
    return `<span class="pulse-legend-item">
      <span class="pulse-legend-color" style="background:${col}"></span>
      ${s.sku}${hasForecast ? ' <span style="opacity:0.5;font-size:0.7em">━━ actual ┅┅ forecast</span>' : ''}
      <span style="opacity:0.6;font-size:0.75em">${accLabel}${wmapeLabel}</span>
    </span>`;
  }).join('');

}

function initPulseControls() {
  let pulseTimeout;
  document.getElementById('pulseSearch').addEventListener('input', (e) => {
    clearTimeout(pulseTimeout);
    pulseTimeout = setTimeout(() => {
      STATE.pulseSearch = e.target.value;
      loadPulseSkuList();
    }, CONFIG.DEBOUNCE_MS);
  });

  document.getElementById('pulseSegFilter').addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#pulseSegFilter .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    STATE.pulseSeg = pill.dataset.seg || '';
    loadPulseSkuList();
  });

  document.getElementById('pulseClear').addEventListener('click', () => {
    STATE.pulseSelected = [];
    STATE.pulseChartData = {};
    renderPulseSelected();
    renderPulseSkuList();
    renderPulseChart();
  });
}
document.addEventListener('DOMContentLoaded', () => { initPulseControls(); });

// ═══════════════════════════════════════════
// PULSE COMPARE: KH (MA3) vs SLG Forecast vs Actual
// ═══════════════════════════════════════════
(function initPulseCompare() {
  const btnChart = document.getElementById('pulseSubChart');
  const btnCompare = document.getElementById('pulseSubCompare');
  const panelChart = document.getElementById('pulsePanelChart');
  const panelCompare = document.getElementById('pulsePanelCompare');
  if (!btnChart || !btnCompare) return;

  let _pcLoaded = false;
  let _pcData = null;
  let _pcFilters = { topN: 200, segment: '', search: '' };
  let _pcLastDisplay = [];

  function switchPulseSub(which) {
    const isChart = which === 'chart';
    panelChart.style.display = isChart ? '' : 'none';
    panelCompare.style.display = isChart ? 'none' : '';
    btnChart.style.color = isChart ? '#10b981' : '#94a3b8';
    btnChart.style.borderBottomColor = isChart ? '#10b981' : 'transparent';
    btnChart.style.fontWeight = isChart ? '600' : '500';
    btnCompare.style.color = isChart ? '#94a3b8' : '#60a5fa';
    btnCompare.style.borderBottomColor = isChart ? 'transparent' : '#60a5fa';
    btnCompare.style.fontWeight = isChart ? '500' : '600';
    if (!isChart && !_pcLoaded) { _pcLoaded = true; loadPulseCompare(); }
  }
  btnChart.addEventListener('click', () => switchPulseSub('chart'));
  btnCompare.addEventListener('click', () => switchPulseSub('compare'));

  async function loadPulseCompare() {
    const loading = document.getElementById('pulseCompareLoading');
    const errDiv = document.getElementById('pulseCompareError');
    const dash = document.getElementById('pulseCompareDashboard');
    loading.style.display = '';
    errDiv.style.display = 'none';
    try {
      const res = await fetch('/api/pulse_compare?per_page=50000');
      const data = await res.json();
      loading.style.display = 'none';
      if (!res.ok || data.error) {
        errDiv.innerHTML = `<div style="color:#ef4444;background:#1a1020;padding:14px;border-radius:8px;font-size:13px">\u274c ${data.error || 'L\u1ed7i'}</div>`;
        errDiv.style.display = '';
        return;
      }
      _pcData = data;
      dash.style.display = '';
      renderPCDashboard();
    } catch (err) {
      loading.style.display = 'none';
      errDiv.innerHTML = `<div style="color:#ef4444;background:#1a1020;padding:14px;border-radius:8px;font-size:13px">\u274c ${err.message}</div>`;
      errDiv.style.display = '';
    }
  }

  function renderPCDashboard() {
    const dash = document.getElementById('pulseCompareDashboard');
    const segments = [...new Set(_pcData.rows.map(r => r.segment).filter(Boolean))].sort();
    let segOpts = '<option value="">T\u1ea5t c\u1ea3 Segment</option>';
    segments.forEach(s => { segOpts += `<option value="${s}">${CONFIG.SEGMENT_NAME[s] || s}</option>`; });

    dash.innerHTML = `<div id="pcFilterBar"></div><div id="pcContent"></div>`;

    document.getElementById('pcFilterBar').innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;padding:12px 16px;background:#161820;border:1px solid #2a2d35;border-radius:10px">
        <span style="color:#94a3b8;font-size:12px;font-weight:600">So s\u00e1nh: KH (BQ3T) vs SLG Forecast</span>
        <div style="width:1px;height:20px;background:#333"></div>
        <select id="pcTopN" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          <option value="100">Top 100</option>
          <option value="200" selected>Top 200</option>
          <option value="500">Top 500</option>
          <option value="0">T\u1ea5t c\u1ea3 SKU</option>
        </select>
        <span style="color:#475569;font-size:11px">b\u00e1n ch\u1ea1y nh\u1ea5t</span>
        <div style="width:1px;height:20px;background:#333"></div>
        <select id="pcSeg" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          ${segOpts}
        </select>
        <div style="width:1px;height:20px;background:#333"></div>
        <input id="pcSearch" type="text" placeholder="T\u00ecm SKU..." style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;width:140px">
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span style="color:#555;font-size:10px" id="pcInfo"></span>
          <button id="pcExport" style="background:#1e293b;color:#10b981;border:1px solid #334155;border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;white-space:nowrap" title="T\u1ea3i CSV">\u2b07 CSV</button>
          <a href="/api/pulse_export" id="pcExportXlsx" style="background:#1e293b;color:#60a5fa;border:1px solid #334155;border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;white-space:nowrap;text-decoration:none" title="T\u1ea3i Excel">\u2b07 Excel</a>
        </div>
      </div>`;

    ['pcTopN','pcSeg'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyPCFilters);
    });
    let _t = null;
    document.getElementById('pcSearch')?.addEventListener('input', () => { clearTimeout(_t); _t = setTimeout(applyPCFilters, 300); });
    document.getElementById('pcExport')?.addEventListener('click', exportPCCSV);

    applyPCFilters();
  }

  function applyPCFilters() {
    _pcFilters.topN = parseInt(document.getElementById('pcTopN')?.value || '200');
    _pcFilters.segment = document.getElementById('pcSeg')?.value || '';
    _pcFilters.search = (document.getElementById('pcSearch')?.value || '').trim().toLowerCase();
    renderPCContent();
  }

  function renderPCContent() {
    const f = _pcFilters;
    const months = _pcData.months || [];
    const summary = _pcData.summary || {};
    let rows = _pcData.rows || [];

    if (f.segment) rows = rows.filter(r => r.segment === f.segment);
    if (f.search) rows = rows.filter(r => r.sku.toLowerCase().includes(f.search));
    if (f.topN > 0 && rows.length > f.topN) rows = rows.slice(0, f.topN);
    _pcLastDisplay = rows;

    const mLbl = ym => { const p = ym.split('-'); return 'T' + parseInt(p[1]); };
    const accColor = v => v >= 0.8 ? '#10b981' : v >= 0.5 ? '#60a5fa' : v > 0 ? '#f59e0b' : '#ef4444';
    const pct = v => (v * 100).toFixed(1) + '%';
    const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : Number(n).toLocaleString();

    // Recompute summary for filtered rows
    const nRows = rows.length;
    const avgFcAcc = nRows > 0 ? rows.reduce((s, r) => s + r.avg_fc_acc, 0) / nRows : 0;
    const avgMa3Acc = nRows > 0 ? rows.reduce((s, r) => s + r.avg_ma3_acc, 0) / nRows : 0;
    const fcWins = rows.filter(r => r.fc_better).length;
    const ma3Wins = rows.filter(r => !r.fc_better && r.avg_fc_acc !== r.avg_ma3_acc).length;
    const ties = nRows - fcWins - ma3Wins;

    document.getElementById('pcInfo').textContent = `${nRows} SKU \u00b7 ${months.length} th\u00e1ng`;

    let html = '';

    // KPI cards
    const fcWin = avgFcAcc > avgMa3Acc;
    html += `<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:170px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:11px;color:#60a5fa;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">SLG Forecast Acc</div>
        <div style="font-size:2rem;font-weight:800;color:${accColor(avgFcAcc)};font-family:var(--mono)">${pct(avgFcAcc)}</div>
      </div>
      <div style="flex:1;min-width:170px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:11px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">KH (BQ 3 th\u00e1ng) Acc</div>
        <div style="font-size:2rem;font-weight:800;color:${accColor(avgMa3Acc)};font-family:var(--mono)">${pct(avgMa3Acc)}</div>
      </div>
      <div style="flex:1;min-width:170px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">SLG Th\u1eafng</div>
        <div style="font-size:2rem;font-weight:800;color:#10b981;font-family:var(--mono)">${fcWins}</div>
        <div style="font-size:10px;color:#555;margin-top:2px">${nRows > 0 ? (fcWins/nRows*100).toFixed(0) : 0}% SKU</div>
      </div>
      <div style="flex:1;min-width:170px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:11px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">KH Th\u1eafng</div>
        <div style="font-size:2rem;font-weight:800;color:#f59e0b;font-family:var(--mono)">${ma3Wins}</div>
        <div style="font-size:10px;color:#555;margin-top:2px">${nRows > 0 ? (ma3Wins/nRows*100).toFixed(0) : 0}% SKU</div>
      </div>
      <div style="flex:1;min-width:120px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">H\u00f2a</div>
        <div style="font-size:2rem;font-weight:800;color:#94a3b8;font-family:var(--mono)">${ties}</div>
      </div>
    </div>`;

    // Comparison table
    html += `<div style="background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px">
        <thead><tr style="border-bottom:1px solid #2a2d35">
          <th style="text-align:left;padding:8px;color:#64748b">SKU</th>
          <th style="text-align:center;padding:8px;color:#64748b">Seg</th>
          <th style="text-align:center;padding:8px;color:#64748b">Model</th>
          <th style="text-align:right;padding:8px;color:#60a5fa;font-size:11px">SLG Acc</th>
          <th style="text-align:right;padding:8px;color:#f59e0b;font-size:11px">KH Acc</th>
          <th style="text-align:center;padding:8px;color:#64748b;font-size:11px">Winner</th>`;
    months.forEach(m => {
      html += `<th style="text-align:center;padding:8px;color:#64748b;font-size:10px" colspan="3">${mLbl(m)}<div style="display:flex;gap:0;font-size:9px;color:#555;margin-top:2px"><span style="flex:1">Act</span><span style="flex:1;color:#60a5fa">SLG</span><span style="flex:1;color:#f59e0b">KH</span></div></th>`;
    });
    html += `<th style="text-align:right;padding:8px;color:#64748b">\u03a3 Actual</th></tr></thead><tbody>`;

    rows.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
      const winner = r.avg_fc_acc > r.avg_ma3_acc ? 'SLG' : (r.avg_ma3_acc > r.avg_fc_acc ? 'KH' : 'TIE');
      const wColor = winner === 'SLG' ? '#10b981' : winner === 'KH' ? '#f59e0b' : '#94a3b8';
      html += `<tr style="border-bottom:1px solid #1e2938;background:${bg}">
        <td style="padding:6px 8px;color:#e2e8f0;font-family:monospace;font-size:11px;white-space:nowrap">${r.sku}</td>
        <td style="padding:6px;text-align:center;color:#888">${CONFIG.SEGMENT_SHORT[r.segment] || (r.segment||'').charAt(0).toUpperCase()}</td>
        <td style="padding:6px;text-align:center;color:#94a3b8;font-size:10px">${r.model_used === 'MA3' ? 'Baseline' : (r.model_used || '')}</td>
        <td style="padding:6px;text-align:right;color:${accColor(r.avg_fc_acc)};font-weight:700">${pct(r.avg_fc_acc)}</td>
        <td style="padding:6px;text-align:right;color:${accColor(r.avg_ma3_acc)};font-weight:700">${pct(r.avg_ma3_acc)}</td>
        <td style="padding:6px;text-align:center;color:${wColor};font-weight:700;font-size:11px">${winner}</td>`;
      months.forEach(m => {
        const md = r.months[m] || {};
        html += `<td style="padding:4px 3px;text-align:right;color:#94a3b8;font-size:10px;border-left:1px solid #1e2938">${fmt(md.actual||0)}</td>`;
        html += `<td style="padding:4px 3px;text-align:right;color:#60a5fa;font-size:10px">${fmt(md.forecast||0)}</td>`;
        html += `<td style="padding:4px 3px;text-align:right;color:#f59e0b;font-size:10px">${fmt(md.ma3||0)}</td>`;
      });
      html += `<td style="padding:6px;text-align:right;color:#94a3b8;font-size:11px;font-weight:600">${fmt(r.total_actual)}</td></tr>`;
    });
    html += `</tbody></table></div>`;

    document.getElementById('pcContent').innerHTML = html;
  }

  function exportPCCSV() {
    if (!_pcLastDisplay.length) return;
    const months = _pcData.months || [];
    const mLbl = ym => { const p = ym.split('-'); return 'T' + parseInt(p[1]); };
    const headers = ['SKU', 'Segment', 'Model', 'SLG Acc', 'KH (BQ3T) Acc', 'Winner'];
    months.forEach(m => { headers.push(mLbl(m)+' Actual', mLbl(m)+' SLG FC', mLbl(m)+' KH MA3'); });
    headers.push('\u03a3 Actual');
    const csvRows = _pcLastDisplay.map(r => {
      const winner = r.avg_fc_acc > r.avg_ma3_acc ? 'SLG' : (r.avg_ma3_acc > r.avg_fc_acc ? 'KH' : 'TIE');
      const row = [r.sku, r.segment, r.model_used, (r.avg_fc_acc*100).toFixed(1)+'%', (r.avg_ma3_acc*100).toFixed(1)+'%', winner];
      months.forEach(m => {
        const md = r.months[m] || {};
        row.push(md.actual||0, md.forecast||0, md.ma3||0);
      });
      row.push(r.total_actual);
      return row;
    });
    exportCSV(headers, csvRows, `pulse_compare_slg_vs_kh_${new Date().toISOString().slice(0,10)}.csv`);
  }
})();

// ═══════════════════════════════════════════
// FORECAST OVERVIEW TAB
// ═══════════════════════════════════════════
async function loadForecast() {
  const loading = document.getElementById('forecastLoading');
  const content = document.getElementById('forecastContent');
  const tableSection = document.getElementById('fcTableSection');
  const isFirstLoad = !STATE.forecastData;

  if (isFirstLoad) {
    loading.style.display = '';
    content.style.display = 'none';
    if (tableSection) tableSection.style.display = 'none';
  }

  try {
    // Load overview if not loaded
    if (isFirstLoad) {
      const data = await api('/api/forecast');
      STATE.forecastData = data;
      renderForecastDashboard(data);
    }
    // Init table controls once
    if (!STATE._fcInited) {
      initFcTableControls();
      STATE._fcInited = true;
    }
    // Load detail table
    await loadFcDetail();
  } catch (err) {
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">Error loading forecast data</div>';
    console.error('Forecast load error:', err);
  } finally {
    loading.style.display = 'none';
    content.style.display = '';
    if (tableSection) tableSection.style.display = '';
  }
}

async function loadFcDetail() {
  const tl = document.getElementById('fcTableLoading');
  if (tl) tl.style.display = '';
  try {
    const data = await api('/api/forecast_detail', STATE.fcFilters);
    STATE.fcDetailData = data;
    renderFcTable(data);
  } catch (err) {
    console.error('Forecast detail error:', err);
    const tbody = document.getElementById('fcTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-3)">Error loading data</td></tr>';
  } finally {
    if (tl) tl.style.display = 'none';
  }
}

function initFcTableControls() {
  // Search
  const searchInput = document.getElementById('fcSearch');
  let fcSearchTimer;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(fcSearchTimer);
      fcSearchTimer = setTimeout(() => {
        STATE.fcFilters.search = searchInput.value.trim();
        STATE.fcFilters.page = 1;
        loadFcDetail();
      }, CONFIG.DEBOUNCE_MS);
    });
  }

  // Segment pills
  document.querySelectorAll('#fcFilterSegment .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#fcFilterSegment .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.fcFilters.segment = btn.dataset.value;
      STATE.fcFilters.page = 1;
      loadFcDetail();
    });
  });

  // Tier pills
  document.querySelectorAll('#fcFilterTier .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#fcFilterTier .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.fcFilters.accuracy_tier = btn.dataset.value;
      STATE.fcFilters.page = 1;
      loadFcDetail();
    });
  });

  // Pagination
  document.getElementById('fcPrevPage').addEventListener('click', () => {
    if (STATE.fcFilters.page > 1) { STATE.fcFilters.page--; loadFcDetail(); }
  });
  document.getElementById('fcNextPage').addEventListener('click', () => {
    if (STATE.fcDetailData && STATE.fcFilters.page < Math.ceil(STATE.fcDetailData.total / STATE.fcFilters.per_page)) {
      STATE.fcFilters.page++; loadFcDetail();
    }
  });
  document.getElementById('fcPerPage').addEventListener('change', (e) => {
    STATE.fcFilters.per_page = parseInt(e.target.value);
    STATE.fcFilters.page = 1;
    loadFcDetail();
  });

  // ── Export Excel button ──
  const btnExport = document.getElementById('btnExportExcel');
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const params = new URLSearchParams();
      if (STATE.fcFilters.segment) params.set('segment', STATE.fcFilters.segment);
      if (STATE.fcFilters.accuracy_tier) params.set('accuracy_tier', STATE.fcFilters.accuracy_tier);
      if (STATE.fcFilters.search) params.set('search', STATE.fcFilters.search);
      try {
        const res = await fetch('/api/forecast_export?' + params.toString());
        if (!res.ok) throw new Error('L\u1ed7i ' + res.status);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'UNIS_Forecast_Export.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('\u0110\u00e3 t\u1ea3i Forecast Excel', 'success');
      } catch (e) {
        showToast('Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c: ' + e.message, 'error');
      }
    });
  }

  // ── Import & Compare button ──
  const btnCompare = document.getElementById('btnImportCompare');
  const modal = document.getElementById('compareModal');
  const modalClose = document.getElementById('compareModalClose');
  const uploadZone = document.getElementById('compareUploadZone');
  const fileInput = document.getElementById('compareFileInput');
  const compareLoading = document.getElementById('compareLoading');
  const compareResults = document.getElementById('compareResults');

  if (btnCompare) {
    btnCompare.addEventListener('click', () => {
      switchTab('accuracy');
    });
    modalClose.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

    // Upload zone
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.style.borderColor = '#3b82f6'; });
    uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = '';
      if (e.dataTransfer.files.length) doCompareUpload(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) doCompareUpload(fileInput.files[0]);
    });
  }

  async function doCompareUpload(file) {
    compareLoading.style.display = '';
    compareResults.style.display = 'none';
    uploadZone.style.display = 'none';
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await fetch('/api/forecast_compare', { method: 'POST', body: form });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        compareResults.innerHTML = `<div style="color:#ef4444;padding:16px;background:#1a1020;border-radius:8px">\u274c ${data.error || 'Unknown error'}</div>`;
        compareResults.style.display = '';
        uploadZone.style.display = '';
        return;
      }
      renderCompareResults(data);
    } catch (err) {
      compareResults.innerHTML = `<div style="color:#ef4444;padding:16px">\u274c ${err.message}</div>`;
      compareResults.style.display = '';
      uploadZone.style.display = '';
    } finally {
      compareLoading.style.display = 'none';
    }
  }

  function renderCompareResults(d) {
    const o = d.overall || {};
    const biasCol = (o.bias_pct || 0) > 0 ? '#f59e0b' : '#10b981';
    const accVal = o.wmape != null ? (100 - o.wmape).toFixed(1) : null;
    const accCol = accVal != null ? (accVal >= 70 ? '#10b981' : accVal >= 40 ? '#f59e0b' : '#ef4444') : '#888';

    let html = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
        <div style="background:var(--bg-2,#161820);padding:16px;border-radius:10px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:#60a5fa">${d.matched_skus?.toLocaleString() || 0}</div>
          <div style="color:var(--text-3,#888);font-size:12px">SKU kh\u1EDBp</div>
        </div>
        <div style="background:var(--bg-2,#161820);padding:16px;border-radius:10px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:#a78bfa">${d.months_matched?.length || 0}</div>
          <div style="color:var(--text-3,#888);font-size:12px">Th\u00E1ng</div>
        </div>
        <div style="background:var(--bg-2,#161820);padding:16px;border-radius:10px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:${accCol}">${accVal != null ? accVal + '%' : '-'}</div>
          <div style="color:var(--text-3,#888);font-size:12px">\u0110\u1ED9 ch\u00EDnh x\u00E1c</div>
        </div>
        <div style="background:var(--bg-2,#161820);padding:16px;border-radius:10px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:${biasCol}">${o.bias_pct != null ? (o.bias_pct > 0 ? '+' : '') + o.bias_pct + '%' : '-'}</div>
          <div style="color:var(--text-3,#888);font-size:12px">Bias</div>
        </div>
      </div>`;

    // By month table
    if (d.by_month?.length) {
      html += `<h4 style="color:var(--text-1,#fff);margin:0 0 8px;font-size:14px">Theo th\u00E1ng</h4>
      <div style="overflow-x:auto;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="color:var(--text-3,#888);border-bottom:1px solid var(--border,#333)">
          <th style="padding:8px;text-align:left">Th\u00E1ng</th><th style="text-align:right;padding:8px">#SKU</th>
          <th style="text-align:right;padding:8px">Forecast</th><th style="text-align:right;padding:8px">Actual</th>
          <th style="text-align:right;padding:8px">\u0110\u1ED9 CX</th><th style="text-align:right;padding:8px">Bias</th>
        </tr></thead><tbody>`;
      d.by_month.forEach(m => {
        const mAcc = m.wmape != null ? (100 - m.wmape).toFixed(1) : null;
        const wc = mAcc != null ? (mAcc >= 70 ? '#10b981' : mAcc >= 40 ? '#f59e0b' : '#ef4444') : '#888';
        const bc = m.bias_pct > 0 ? '#f59e0b' : '#10b981';
        html += `<tr style="border-bottom:1px solid var(--border,#222)">
          <td style="padding:8px;color:var(--text-1,#fff)">${m.year_month}</td>
          <td style="text-align:right;padding:8px;color:var(--text-2,#bbb)">${m.n_sku.toLocaleString()}</td>
          <td style="text-align:right;padding:8px;color:var(--text-2,#bbb)">${Number(m.total_forecast).toLocaleString()}</td>
          <td style="text-align:right;padding:8px;color:var(--text-2,#bbb)">${Number(m.total_actual).toLocaleString()}</td>
          <td style="text-align:right;padding:8px;color:${wc};font-weight:600">${mAcc != null ? mAcc + '%' : '-'}</td>
          <td style="text-align:right;padding:8px;color:${bc}">${m.bias_pct != null ? (m.bias_pct > 0 ? '+' : '') + m.bias_pct + '%' : '-'}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }

    // By segment table
    if (d.by_segment?.length) {
      const segColors = { 'ML_CANDIDATE': '#10b981', 'MA3_CANDIDATE': '#f59e0b', 'TOO_SPARSE': '#ef4444', 'COLD_START': '#3b82f6' };
      html += `<h4 style="color:var(--text-1,#fff);margin:0 0 8px;font-size:14px">Theo segment</h4>
      <div style="overflow-x:auto;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="color:var(--text-3,#888);border-bottom:1px solid var(--border,#333)">
          <th style="padding:8px;text-align:left">Segment</th><th style="text-align:right;padding:8px">#SKU</th>
          <th style="text-align:right;padding:8px">Forecast</th><th style="text-align:right;padding:8px">Actual</th>
          <th style="text-align:right;padding:8px">\u0110\u1ED9 CX</th><th style="text-align:right;padding:8px">Bias</th>
        </tr></thead><tbody>`;
      d.by_segment.forEach(s => {
        const sc = segColors[s.segment] || '#6b7280';
        const sAcc = s.wmape != null ? (100 - s.wmape).toFixed(1) : null;
        const wc = sAcc != null ? (sAcc >= 70 ? '#10b981' : sAcc >= 40 ? '#f59e0b' : '#ef4444') : '#888';
        html += `<tr style="border-bottom:1px solid var(--border,#222)">
          <td style="padding:8px"><span style="color:${sc};font-weight:600">${s.segment.split('_')[0].toUpperCase()}</span> <span style="color:var(--text-3,#888)">${s.segment}</span></td>
          <td style="text-align:right;padding:8px;color:var(--text-2,#bbb)">${s.n_sku.toLocaleString()}</td>
          <td style="text-align:right;padding:8px;color:var(--text-2,#bbb)">${Number(s.total_forecast).toLocaleString()}</td>
          <td style="text-align:right;padding:8px;color:var(--text-2,#bbb)">${Number(s.total_actual).toLocaleString()}</td>
          <td style="text-align:right;padding:8px;color:${wc};font-weight:600">${sAcc != null ? sAcc + '%' : '-'}</td>
          <td style="text-align:right;padding:8px">${s.bias_pct != null ? (s.bias_pct > 0 ? '+' : '') + s.bias_pct + '%' : '-'}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }

    // Top errors
    if (d.top_errors?.length) {
      html += `<h4 style="color:var(--text-1,#fff);margin:0 0 8px;font-size:14px">Top 20 SKU sai l\u1EC7ch l\u1EDBn nh\u1EA5t</h4>
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="color:var(--text-3,#888);border-bottom:1px solid var(--border,#333)">
          <th style="padding:6px;text-align:left">SKU</th><th style="padding:6px">Seg</th>
          <th style="text-align:right;padding:6px">Forecast</th><th style="text-align:right;padding:6px">Actual</th>
          <th style="text-align:right;padding:6px">|Error|</th><th style="text-align:right;padding:6px">\u0110CX%</th>
        </tr></thead><tbody>`;
      d.top_errors.forEach(r => {
        const rAcc = r.wmape != null ? (100 - r.wmape).toFixed(1) : '-';
        html += `<tr style="border-bottom:1px solid var(--border,#222)">
          <td style="padding:6px;color:var(--text-1,#fff);font-family:monospace;font-size:11px">${r.sku}</td>
          <td style="padding:6px;text-align:center;color:var(--text-3,#888)">${CONFIG.SEGMENT_SHORT[r.segment] || (r.segment || '').charAt(0)}</td>
          <td style="text-align:right;padding:6px;color:var(--text-2,#bbb)">${Number(r.total_forecast).toLocaleString()}</td>
          <td style="text-align:right;padding:6px;color:var(--text-2,#bbb)">${Number(r.total_actual).toLocaleString()}</td>
          <td style="text-align:right;padding:6px;color:#ef4444;font-weight:600">${Number(r.total_abs_error).toLocaleString()}</td>
          <td style="text-align:right;padding:6px;color:#f59e0b">${rAcc}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }

    // Reset upload button
    html += `<div style="margin-top:20px;text-align:center">
      <button id="compareReset" style="background:#3b82f6;color:#fff;padding:8px 20px;border:none;border-radius:8px;cursor:pointer;font-size:13px">\u21BB Upload file kh\u00E1c</button>
    </div>`;

    compareResults.innerHTML = html;
    compareResults.style.display = '';

    document.getElementById('compareReset')?.addEventListener('click', () => {
      compareResults.style.display = 'none';
      uploadZone.style.display = '';
      fileInput.value = '';
    });
  }
}

// ══════════════════════════════════════════════════════════════
// ACCURACY V7 — Per-month accuracy (NOT aggregated)
// Uses /api/monthly_accuracy endpoint with V7 confidence routing
// ══════════════════════════════════════════════════════════════

(function initAccuracyV7() {
  const loadingEl = document.getElementById('accV7Loading');
  const errorEl = document.getElementById('accV7Error');
  const dashboard = document.getElementById('accV7Dashboard');
  if (!dashboard) return;

  let _v7Data = null;
  let _v7Loaded = false;
  let _accFilters = { topN: 100, segment: '', month: '' };
  let _v7Processed = null;

  const observer = new MutationObserver(() => {
    const tab = document.getElementById('tab-accuracy');
    if (tab && tab.style.display !== 'none' && !_v7Loaded) { _v7Loaded = true; loadV7Data(); }
  });
  const tabEl = document.getElementById('tab-accuracy');
  if (tabEl) observer.observe(tabEl, { attributes: true, attributeFilter: ['style'] });
  if (tabEl && tabEl.style.display !== 'none') { _v7Loaded = true; loadV7Data(); }

  let _topNData = null;

  async function loadV7Data() {
    if (loadingEl) loadingEl.style.display = '';
    if (errorEl) errorEl.style.display = 'none';
    try {
      const [res, topNRes] = await Promise.all([
        fetch('/api/monthly_accuracy?per_page=50000'),
        fetch('/api/top_n_accuracy'),
      ]);
      const data = await res.json();
      _topNData = await topNRes.json();
      if (loadingEl) loadingEl.style.display = 'none';
      if (!res.ok || data.error) {
        if (errorEl) { errorEl.innerHTML = `<div style="color:#ef4444;background:#1a1020;padding:14px;border-radius:8px;font-size:13px">\u274c ${data.error || 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c d\u1eef li\u1ec7u'}</div>`; errorEl.style.display = ''; }
        return;
      }
      _v7Data = data;
      dashboard.style.display = '';
      renderV7Dashboard();
    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) { errorEl.innerHTML = `<div style="color:#ef4444;background:#1a1020;padding:14px;border-radius:8px;font-size:13px">\u274c ${err.message}</div>`; errorEl.style.display = ''; }
    }
  }

  function renderV7Dashboard() {
    dashboard.innerHTML = `<div id="accTopNCard"></div><div id="accV7FilterBar"></div><div id="accV7Content"></div>`;
    renderTopNCard();
    renderV7FilterBar();
    applyV7Filters();
  }

  function renderTopNCard() {
    const el = document.getElementById('accTopNCard');
    if (!el || !_topNData) return;
    const tiers = _topNData.tiers || [];
    const zeroN = _topNData.zero_fskus || 0;
    const activeN = _topNData.active_fskus || 0;
    const accColor = a => a >= 60 ? '#10b981' : a >= 50 ? '#60a5fa' : a >= 40 ? '#f59e0b' : '#ef4444';

    const barsHtml = tiers.map(t => {
      const w = Math.max(8, t.accuracy);
      return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0">
        <span style="color:#94a3b8;font-size:12px;width:140px;text-align:right;flex-shrink:0">${t.tier}</span>
        <div style="flex:1;background:#1e293b;border-radius:4px;height:24px;position:relative;overflow:hidden">
          <div style="width:${w}%;height:100%;background:${accColor(t.accuracy)};border-radius:4px;transition:width 0.5s"></div>
          <span style="position:absolute;right:8px;top:3px;font-size:11px;color:#e2e8f0;font-weight:700">${t.accuracy}%</span>
        </div>
        <span style="color:#64748b;font-size:11px;width:80px;flex-shrink:0">${t.vol_pct}% vol</span>
      </div>`;
    }).join('');

    // Monthly breakdown from the "all active" tier
    const allTier = tiers.find(t => t.n >= activeN) || tiers[tiers.length - 1];
    const monthlyHtml = allTier && allTier.monthly ? Object.entries(allTier.monthly).sort().map(([ym, acc]) => {
      const mLabel = 'T' + parseInt(ym.split('-')[1]);
      return `<div style="text-align:center">
        <div style="font-size:16px;font-weight:700;color:${accColor(acc)}">${acc}%</div>
        <div style="font-size:10px;color:#64748b">${mLabel}</div>
      </div>`;
    }).join('') : '';

    el.innerHTML = `
      <div style="background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px 20px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <span style="color:#e2e8f0;font-size:14px;font-weight:700">Accuracy by Volume Tier</span>
            <span style="color:#64748b;font-size:11px;margin-left:8px">(ch\u1ec9 t\u00ednh F_SKU c\u00f3 actual > 0)</span>
          </div>
          <div style="display:flex;gap:16px;align-items:center">
            <span style="color:#94a3b8;font-size:11px">${activeN.toLocaleString()} active</span>
            <span style="color:#64748b;font-size:11px">${zeroN.toLocaleString()} lo\u1ea1i (actual=0)</span>
          </div>
        </div>
        <div style="display:flex;gap:24px">
          <div style="flex:2">${barsHtml}</div>
          <div style="flex:1;display:flex;align-items:center;justify-content:space-around;background:#0f172a;border-radius:8px;padding:12px">${monthlyHtml}</div>
        </div>
      </div>`;
  }

  function renderV7FilterBar() {
    const months = (_v7Data.summary?.months || []).sort();
    const mLbl = ym => { const p = ym.split('-'); return 'T' + parseInt(p[1]); };
    let monthOpts = `<option value="">T\u1ea5t c\u1ea3 th\u00e1ng</option>`;
    months.forEach(m => { monthOpts += `<option value="${m}">${mLbl(m)}</option>`; });

    const bar = document.getElementById('accV7FilterBar');
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;padding:12px 16px;background:#161820;border:1px solid #2a2d35;border-radius:10px">
        <span style="color:#94a3b8;font-size:12px;font-weight:600">Model Accuracy</span>
        <span style="background:#10b98133;color:#10b981;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">Per-month</span>
        <div style="width:1px;height:20px;background:#333"></div>
        <select id="accV7TopN" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          <option value="50">Top 50</option>
          <option value="100" selected>Top 100</option>
          <option value="200">Top 200</option>
          <option value="500">Top 500</option>
          <option value="0">T\u1ea5t c\u1ea3 SKU</option>
        </select>
        <select id="accV7SortBy" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          <option value="volume" selected>b\u00e1n ch\u1ea1y nh\u1ea5t</option>
          <option value="acc_high">accuracy cao nh\u1ea5t</option>
          <option value="acc_low">accuracy th\u1ea5p nh\u1ea5t</option>
        </select>
        <div style="width:1px;height:20px;background:#333"></div>
        <select id="accV7Month" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          ${monthOpts}
        </select>
        <div style="width:1px;height:20px;background:#333"></div>
        <select id="accV7Seg" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          <option value="">T\u1ea5t c\u1ea3 Segment</option>
          <option value="ML_CANDIDATE">ML Candidate (A)</option><option value="MA3_CANDIDATE">MA3 Candidate (B)</option><option value="TOO_SPARSE">Too Sparse (C)</option><option value="COLD_START">Cold Start (D)</option>
        </select>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span style="color:#555;font-size:10px" id="accV7Info"></span>
          <button id="accV7Export" style="background:#1e293b;color:#10b981;border:1px solid #334155;border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;white-space:nowrap" title="Tải CSV">\u2b07 CSV</button>
          <a href="/api/accuracy_export" style="background:#1e293b;color:#60a5fa;border:1px solid #334155;border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;white-space:nowrap;text-decoration:none" title="Tải Excel">\u2b07 Excel</a>
        </div>
      </div>`;

    ['accV7TopN','accV7Month','accV7Seg','accV7SortBy'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyV7Filters);
    });
  }

  function applyV7Filters() {
    _accFilters.topN = parseInt(document.getElementById('accV7TopN')?.value || '100');
    _accFilters.month = document.getElementById('accV7Month')?.value || '';
    _accFilters.segment = document.getElementById('accV7Seg')?.value || '';
    _accFilters.sortBy = document.getElementById('accV7SortBy')?.value || 'volume';
    _v7Processed = processV7Data(_v7Data, _accFilters);
    renderV7Content(_v7Processed);
    document.getElementById('accV7Export')?.addEventListener('click', exportV7CSV);
  }

  function exportV7CSV() {
    if (!_v7Processed) return;
    const { skuList, allMonths } = _v7Processed;
    const mLbl = ym => { const p = ym.split('-'); return 'T' + parseInt(p[1]); };
    const headers = ['SKU', 'Segment', 'Model', 'Accuracy'].concat(allMonths.map(mLbl)).concat(['\u03a3 Actual']);
    const rows = skuList.map(s => {
      const row = [s.sku, s.segment || '', s.model_used || 'Baseline', (s.avgAcc * 100).toFixed(1) + '%'];
      allMonths.forEach(ym => {
        const md = s.months[ym];
        row.push(md ? (md.routed_acc * 100).toFixed(1) + '%' : '');
      });
      row.push(s.totalActual);
      return row;
    });
    exportCSV(headers, rows, `model_accuracy_${new Date().toISOString().slice(0,10)}.csv`);
  }

  function processV7Data(apiData, filters) {
    const rows = apiData.rows || [];
    const segCol = { 'ML_CANDIDATE': '#10b981', 'MA3_CANDIDATE': '#f59e0b', 'TOO_SPARSE': '#ef4444', 'COLD_START': '#3b82f6' };
    const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : Number(n).toLocaleString();

    let filtered = rows;
    if (filters.segment) filtered = filtered.filter(r => r.segment === filters.segment);
    if (filters.month) filtered = filtered.filter(r => r.month === filters.month);

    // Group by SKU — model-only view
    const skuMap = {};
    filtered.forEach(r => {
      if (!skuMap[r.sku]) skuMap[r.sku] = { sku: r.sku, segment: r.segment, model_used: r.model_used || 'Baseline', decision: r.decision, months: {}, totalActual: 0, totalErr: 0, monthCount: 0, sumAcc: 0 };
      const s = skuMap[r.sku];
      s.months[r.month] = r;
      s.totalActual += r.actual;
      // Track absolute error for wMAPE calculation
      s.totalErr += Math.abs(r.actual - r.forecast);
      s.monthCount++;
      s.sumAcc += r.routed_acc;
    });

    let skuList = Object.values(skuMap).map(s => ({
      ...s,
      // Use wMAPE-based accuracy (consistent with top-N card)
      avgAcc: s.totalActual > 0 ? Math.max(0, 1 - s.totalErr / s.totalActual) : 0,
    }));

    if (filters.sortBy === 'acc_high') {
      skuList.sort((a, b) => b.avgAcc - a.avgAcc || b.totalActual - a.totalActual);
    } else if (filters.sortBy === 'acc_low') {
      skuList.sort((a, b) => a.avgAcc - b.avgAcc || b.totalActual - a.totalActual);
    } else {
      skuList.sort((a, b) => b.totalActual - a.totalActual);
    }
    if (filters.topN > 0 && skuList.length > filters.topN) skuList = skuList.slice(0, filters.topN);

    const allMonths = [...new Set(filtered.map(r => r.month))].sort();
    const displaySkuSet = new Set(skuList.map(s => s.sku));
    const displayRows = filtered.filter(r => displaySkuSet.has(r.sku));

    const totalMonthRows = displayRows.length;
    // wMAPE-based overall accuracy (volume-weighted, consistent with top-N card)
    const totalAct = displayRows.reduce((a, r) => a + r.actual, 0);
    const totalErr = displayRows.reduce((a, r) => a + Math.abs(r.actual - r.forecast), 0);
    const avgAcc = totalAct > 0 ? Math.max(0, 1 - totalErr / totalAct) : 0;

    // Per-month breakdown (wMAPE-based)
    const monthBreakdown = allMonths.map(m => {
      const mRows = displayRows.filter(r => r.month === m);
      const mAct = mRows.reduce((a, r) => a + r.actual, 0);
      const mErr = mRows.reduce((a, r) => a + Math.abs(r.actual - r.forecast), 0);
      return {
        month: m,
        n_skus: mRows.length,
        avgAcc: mAct > 0 ? Math.max(0, 1 - mErr / mAct) : 0,
      };
    });

    // Per-segment breakdown (wMAPE-based)
    const segBreakdown = {};
    displayRows.forEach(r => {
      if (!segBreakdown[r.segment]) segBreakdown[r.segment] = { rows: 0, sumAct: 0, sumErr: 0, skus: new Set() };
      const s = segBreakdown[r.segment];
      s.rows++; s.sumAct += r.actual; s.sumErr += Math.abs(r.actual - r.forecast); s.skus.add(r.sku);
    });

    // Model distribution
    const modelDist = {};
    skuList.forEach(s => { const m = s.model_used || 'Unknown'; modelDist[m] = (modelDist[m] || 0) + 1; });

    // Accuracy tier distribution
    const tierDist = { high: 0, medium: 0, low: 0, poor: 0 };
    skuList.forEach(s => {
      if (s.avgAcc >= 0.8) tierDist.high++;
      else if (s.avgAcc >= 0.5) tierDist.medium++;
      else if (s.avgAcc >= 0.2) tierDist.low++;
      else tierDist.poor++;
    });

    return { skuList, allMonths, totalMonthRows, avgAcc, monthBreakdown, segBreakdown, modelDist, tierDist, fmt, segCol };
  }

  function renderV7Content(d) {
    const { skuList, allMonths, totalMonthRows, avgAcc, monthBreakdown, segBreakdown, modelDist, tierDist, fmt, segCol } = d;

    const mLbl = ym => { const p = ym.split('-'); return 'T' + parseInt(p[1]); };
    const accColor = c => c >= 0.8 ? '#10b981' : c >= 0.5 ? '#60a5fa' : c > 0 ? '#f59e0b' : '#ef4444';
    const pct = v => (v * 100).toFixed(1) + '%';

    const infoEl = document.getElementById('accV7Info');
    if (infoEl) infoEl.textContent = `${skuList.length} SKU \u00b7 ${totalMonthRows} l\u01b0\u1ee3t \u00b7 ${allMonths.length} th\u00e1ng`;

    let html = '';

    // ── KPI Cards ──
    const totalSkus = skuList.length || 1;
    html += `<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:160px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:18px;text-align:center">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Accuracy TB</div>
        <div style="font-size:2.2rem;font-weight:800;color:${accColor(avgAcc)};font-family:var(--mono)">${pct(avgAcc)}</div>
        <div style="font-size:10px;color:#555;margin-top:4px">wMAPE-based</div>
      </div>
      <div style="flex:1;min-width:160px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:18px;text-align:center">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">SKU</div>
        <div style="font-size:2.2rem;font-weight:800;color:#60a5fa;font-family:var(--mono)">${skuList.length.toLocaleString()}</div>
        <div style="font-size:10px;color:#555;margin-top:4px">${allMonths.length} th\u00e1ng held-out</div>
      </div>
      <div style="flex:1;min-width:160px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:18px;text-align:center">
        <div style="font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Acc \u2265 80%</div>
        <div style="font-size:2.2rem;font-weight:800;color:#10b981;font-family:var(--mono)">${tierDist.high}</div>
        <div style="font-size:10px;color:#555;margin-top:4px">${(tierDist.high/totalSkus*100).toFixed(0)}% SKU</div>
      </div>
      <div style="flex:1;min-width:160px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:18px;text-align:center">
        <div style="font-size:11px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Acc < 20%</div>
        <div style="font-size:2.2rem;font-weight:800;color:#f59e0b;font-family:var(--mono)">${tierDist.poor}</div>
        <div style="font-size:10px;color:#555;margin-top:4px">${(tierDist.poor/totalSkus*100).toFixed(0)}% SKU</div>
      </div>
    </div>`;

    // (Segment + Model cards removed per user request — only accuracy matters)

    // ── Per-month accuracy table ──
    if (monthBreakdown.length) {
      html += `<div style="background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:20px 24px;margin-bottom:14px">
        <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:12px">Accuracy theo th\u00e1ng</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;max-width:500px">
          <thead><tr style="border-bottom:1px solid #2a2d35">
            <th style="text-align:left;padding:8px;color:#64748b">Th\u00e1ng</th>
            <th style="text-align:center;padding:8px;color:#64748b">SKU</th>
            <th style="text-align:right;padding:8px;color:#64748b">Accuracy TB</th>
          </tr></thead><tbody>`;
      monthBreakdown.forEach(m => {
        html += `<tr style="border-bottom:1px solid #1e2938">
          <td style="padding:8px;color:#94a3b8;font-weight:600">${mLbl(m.month)}</td>
          <td style="padding:8px;text-align:center;color:#888">${m.n_skus.toLocaleString()}</td>
          <td style="padding:8px;text-align:right;font-family:var(--mono);color:${accColor(m.avgAcc)};font-weight:700">${pct(m.avgAcc)}</td>
        </tr>`;
      });
      html += `</tbody></table>
        <div style="margin-top:10px;font-size:11px;color:#475569;padding:8px 12px;background:#0f172a;border-radius:6px">
          wMAPE Accuracy = 1 - \u03a3|actual - pred| / \u03a3actual. Volume-weighted, ch\u1ec9 t\u00ednh actual > 0.
        </div>
      </div>`;
    }

    // ── SKU Detail Table ──
    if (skuList.length) {
      html += `<div style="background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:20px 24px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <span style="color:#fff;font-size:16px;font-weight:700">Chi ti\u1ebft t\u1eebng SKU</span>
            <span style="color:#64748b;font-size:13px;margin-left:8px" id="accV7Count">${skuList.length} m\u00e3</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="text" id="accV7Search" placeholder="T\u00ecm m\u00e3 SKU..." style="background:#0f172a;color:#cbd5e1;border:1px solid #334155;border-radius:6px;padding:6px 12px;font-size:13px;width:180px">
            <div style="display:flex;align-items:center;gap:4px;color:#64748b;font-size:12px" id="accV7PageInfo"></div>
            <button id="accV7Prev" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer" disabled>&larr;</button>
            <button id="accV7Next" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">&rarr;</button>
          </div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;min-width:800px" id="accV7Table">
            <thead style="position:sticky;top:0;background:#1a1e2a;z-index:2"><tr>
              <th class="acc-th v7-th-sort" data-col="sku" style="text-align:left;min-width:180px;padding:10px 12px">SKU</th>
              <th class="acc-th v7-th-sort" data-col="seg" style="text-align:center;width:42px;padding:10px 6px">Seg</th>
              <th class="acc-th v7-th-sort" data-col="model" style="text-align:center;width:110px;padding:10px 6px">Model</th>
              <th class="acc-th v7-th-sort" data-col="acc" style="text-align:right;width:80px;padding:10px 6px">Accuracy</th>`;
      allMonths.forEach(ym => {
        html += `<th class="acc-th" style="text-align:center;padding:10px 4px;font-size:11px">${mLbl(ym)}</th>`;
      });
      html += `<th class="acc-th v7-th-sort" data-col="actual" style="text-align:right;width:70px;padding:10px 6px">\u03a3 Actual</th>
            </tr></thead><tbody id="accV7Body"></tbody>
          </table>
        </div>
      </div>`;
    }

    const contentEl = document.getElementById('accV7Content');
    if (contentEl) contentEl.innerHTML = html;

    // ── Table logic ──
    if (skuList.length) {
      const PER_PAGE = 50;
      let dtSort = { col: 'actual', dir: 'desc' };
      let dtPage = 1;
      let dtFiltered = [...skuList];

      function dtFilter() {
        const q = (document.getElementById('accV7Search')?.value || '').toLowerCase();
        dtFiltered = skuList.filter(r => !q || r.sku.toLowerCase().includes(q));
        dtSort2();
      }

      function dtSort2() {
        dtFiltered.sort((a, b) => {
          if (dtSort.col === 'sku') return dtSort.dir === 'asc' ? a.sku.localeCompare(b.sku) : b.sku.localeCompare(a.sku);
          if (dtSort.col === 'seg') return dtSort.dir === 'asc' ? (a.segment||'').localeCompare(b.segment||'') : (b.segment||'').localeCompare(a.segment||'');
          if (dtSort.col === 'model') return dtSort.dir === 'asc' ? (a.model_used||'').localeCompare(b.model_used||'') : (b.model_used||'').localeCompare(a.model_used||'');
          const va = dtSort.col === 'acc' ? a.avgAcc : a.totalActual;
          const vb = dtSort.col === 'acc' ? b.avgAcc : b.totalActual;
          return dtSort.dir === 'asc' ? va - vb : vb - va;
        });
        dtPage = 1;
        dtRender2();
      }

      function dtRender2() {
        const tbody = document.getElementById('accV7Body');
        if (!tbody) return;
        const total = dtFiltered.length;
        const pages = Math.max(1, Math.ceil(total / PER_PAGE));
        if (dtPage > pages) dtPage = pages;
        const start = (dtPage - 1) * PER_PAGE;
        const slice = dtFiltered.slice(start, start + PER_PAGE);

        let rows = '';
        slice.forEach((r, idx) => {
          const segC = segCol[r.segment] || '#6b7280';
          const segL = CONFIG.SEGMENT_SHORT[r.segment] || (r.segment||'').charAt(0).toUpperCase();
          const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
          const modelName = (r.model_used === 'MA3') ? 'Baseline' : (r.model_used || 'Baseline');

          rows += `<tr style="border-bottom:1px solid #1e2938;background:${rowBg}">
            <td style="padding:6px 10px;color:#e2e8f0;font-family:'JetBrains Mono',monospace;font-size:12px;white-space:nowrap;font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis" title="${r.sku}">${r.sku}</td>
            <td style="padding:6px 4px;text-align:center"><span style="color:${segC};font-weight:700;font-size:12px">${segL}</span></td>
            <td style="padding:6px 6px;text-align:center;font-size:11px;color:#94a3b8">${modelName}</td>
            <td style="padding:6px 6px;text-align:right;font-weight:700;font-size:14px;color:${accColor(r.avgAcc)};font-family:var(--mono)">${(r.avgAcc*100).toFixed(0)}%</td>`;

          allMonths.forEach(ym => {
            const mData = r.months[ym];
            if (mData) {
              rows += `<td style="padding:5px 4px;text-align:center;color:${accColor(mData.routed_acc)};font-size:12px;font-weight:600;font-variant-numeric:tabular-nums">${(mData.routed_acc*100).toFixed(0)}%</td>`;
            } else {
              rows += `<td style="padding:5px 4px;text-align:center;color:#444;font-size:11px">-</td>`;
            }
          });

          rows += `<td style="padding:6px 6px;text-align:right;color:#94a3b8;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums">${fmt(r.totalActual)}</td></tr>`;
        });
        tbody.innerHTML = rows;

        const info = document.getElementById('accV7PageInfo');
        if (info) info.textContent = `${start+1}-${Math.min(start+PER_PAGE, total)} / ${total}`;
        const countEl = document.getElementById('accV7Count');
        if (countEl) countEl.textContent = total === skuList.length ? `${total} m\u00e3` : `${total} / ${skuList.length} m\u00e3`;
        document.getElementById('accV7Prev').disabled = dtPage <= 1;
        document.getElementById('accV7Next').disabled = dtPage >= pages;
      }

      document.querySelectorAll('.v7-th-sort').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          const col = th.dataset.col;
          if (dtSort.col === col) dtSort.dir = dtSort.dir === 'desc' ? 'asc' : 'desc';
          else { dtSort.col = col; dtSort.dir = col === 'sku' ? 'asc' : 'desc'; }
          document.querySelectorAll('.v7-th-sort').forEach(h => { h.classList.remove('acc-th-active'); h.textContent = h.textContent.replace(/ [\u25b2\u25bc]/g, ''); });
          th.classList.add('acc-th-active');
          th.textContent += dtSort.dir === 'asc' ? ' \u25b2' : ' \u25bc';
          dtSort2();
        });
      });

      document.getElementById('accV7Search')?.addEventListener('input', dtFilter);
      document.getElementById('accV7Prev')?.addEventListener('click', () => { dtPage--; dtRender2(); });
      document.getElementById('accV7Next')?.addEventListener('click', () => { dtPage++; dtRender2(); });
      dtFilter();
    }
  }
})();

// ── Accuracy sub-tab switcher + Upload handler ──
(function initAccSubTabs() {
  const btnV7 = document.getElementById('accSubV7');
  const btnUpload = document.getElementById('accSubUpload');
  const panelV7 = document.getElementById('accPanelV7');
  const panelUpload = document.getElementById('accPanelUpload');
  if (!btnV7 || !btnUpload) return;

  function switchTo(which) {
    const isV7 = which === 'v7';
    panelV7.style.display = isV7 ? '' : 'none';
    panelUpload.style.display = isV7 ? 'none' : '';
    btnV7.style.color = isV7 ? '#10b981' : '#94a3b8';
    btnV7.style.borderBottomColor = isV7 ? '#10b981' : 'transparent';
    btnV7.style.fontWeight = isV7 ? '600' : '500';
    btnUpload.style.color = isV7 ? '#94a3b8' : '#60a5fa';
    btnUpload.style.borderBottomColor = isV7 ? 'transparent' : '#60a5fa';
    btnUpload.style.fontWeight = isV7 ? '500' : '600';
  }
  btnV7.addEventListener('click', () => switchTo('v7'));
  btnUpload.addEventListener('click', () => switchTo('upload'));

  // ── Upload handler (restored from V5/V6 flow) ──
  const uploadSection = document.getElementById('accUploadSection');
  const dashboard = document.getElementById('accDashboard');
  const uploadZone = document.getElementById('accUploadZone');
  const fileInput = document.getElementById('accFileInput');
  const loading = document.getElementById('accLoading');
  const errDiv = document.getElementById('accError');
  if (!uploadZone) return;

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = '#3b82f6'; });
  uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = '#333'; });
  uploadZone.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.style.borderColor = '#333';
    if (e.dataTransfer.files.length) handleAccFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files.length) handleAccFile(fileInput.files[0]); });

  async function handleAccFile(file) {
    console.log('[Upload] handleAccFile called:', file.name, file.size);
    loading.style.display = '';
    errDiv.style.display = 'none';
    const form = new FormData();
    form.append('file', file);
    try {
      console.log('[Upload] Sending to /api/forecast_compare ...');
      const res = await fetch('/api/forecast_compare', { method: 'POST', body: form });
      const data = await res.json();
      console.log('[Upload] Response:', res.status, 'total:', data.total, 'error:', data.error);
      loading.style.display = 'none';
      if (!res.ok || data.error) {
        errDiv.innerHTML = `<div style="color:#ef4444;background:#1a1020;padding:14px;border-radius:8px;font-size:13px">\u274c ${data.error || 'L\u1ed7i'}</div>`;
        errDiv.style.display = '';
        return;
      }
      if (!data.all_skus || data.all_skus.length === 0) {
        errDiv.innerHTML = `<div style="color:#f59e0b;background:#1a1020;padding:14px;border-radius:8px;font-size:13px">\u26a0 Không tìm thấy F_SKU nào khớp. Kiểm tra cột fsku/SKU trong file.</div>`;
        errDiv.style.display = '';
        return;
      }
      uploadSection.style.display = 'none';
      dashboard.style.display = '';
      renderUploadAccDashboard(data, file.name);
    } catch (err) {
      console.error('[Upload] Error:', err);
      loading.style.display = 'none';
      errDiv.innerHTML = `<div style="color:#ef4444;background:#1a1020;padding:14px;border-radius:8px;font-size:13px">\u274c ${err.message}</div>`;
      errDiv.style.display = '';
    }
  }

  function renderUploadAccDashboard(d, fileName) {
    const allSkus = d.all_skus || [];
    const months = (d.months_matched || []).sort();
    const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : Number(n).toLocaleString();
    const mLbl = ym => { const mm = ym.slice(-2); return {'08':'T8','09':'T9','10':'T10','11':'T11','12':'T12','01':'T1','02':'T2','03':'T3'}[mm] || mm; };
    const accColor = v => v >= 80 ? '#10b981' : v >= 50 ? '#60a5fa' : v > 0 ? '#f59e0b' : '#ef4444';

    // Enrich all SKUs with accuracy data
    const enriched = allSkus.map(r => {
      let sumAcc = 0, nMonths = 0;
      const monthDetails = {};
      months.forEach(ym => {
        const mm = ym.slice(-2);
        const fc = r['fc_' + mm], act = r['act_' + mm];
        if (act != null && fc != null) {
          const denom = Math.max(Math.abs(act), Math.abs(fc), 1);
          const acc = 1 - Math.abs(act - fc) / denom;
          monthDetails[mm] = { acc, actual: act, forecast: fc };
          sumAcc += acc; nMonths++;
        }
      });
      const avgAcc = nMonths > 0 ? sumAcc / nMonths * 100 : null;
      const totalAct = months.reduce((s, ym) => s + (r['act_' + ym.slice(-2)] || 0), 0);
      return { ...r, _avgAcc: avgAcc, _totalAct: totalAct, _monthDetails: monthDetails, _nMonths: nMonths };
    });
    enriched.sort((a, b) => (b._totalAct || 0) - (a._totalAct || 0));

    // Collect unique segments
    const segments = [...new Set(allSkus.map(r => r.segment).filter(Boolean))].sort();

    // State
    let _upFilters = { topN: 100, segment: '', month: '', search: '', sort: 'top' };

    // Render layout: header + filter bar + content
    dashboard.innerHTML = `<div id="upHeaderBar"></div><div id="upFilterBar"></div><div id="upContent"></div>`;

    // Header with filename + upload-back button
    document.getElementById('upHeaderBar').innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <span style="color:#fff;font-size:14px;font-weight:700">${fileName}</span>
        <span style="color:#666;font-size:11px">${allSkus.length} SKU \u00b7 ${months.length} th\u00e1ng</span>
        <button id="accUploadBack" style="margin-left:auto;background:#1e293b;color:#60a5fa;border:1px solid #334155;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer">\u21bb Upload kh\u00e1c</button>
      </div>`;
    document.getElementById('accUploadBack')?.addEventListener('click', () => {
      dashboard.style.display = 'none';
      uploadSection.style.display = '';
      fileInput.value = '';
    });

    // Filter bar
    let monthOpts = '<option value="">T\u1ea5t c\u1ea3 th\u00e1ng</option>';
    months.forEach(m => { monthOpts += `<option value="${m}">${mLbl(m)}</option>`; });
    let segOpts = '<option value="">T\u1ea5t c\u1ea3 Segment</option>';
    segments.forEach(s => { segOpts += `<option value="${s}">${CONFIG.SEGMENT_NAME[s] || s}</option>`; });

    document.getElementById('upFilterBar').innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;padding:12px 16px;background:#161820;border:1px solid #2a2d35;border-radius:10px">
        <span style="color:#94a3b8;font-size:12px;font-weight:600">Upload Accuracy</span>
        <div style="width:1px;height:20px;background:#333"></div>
        <select id="upTopN" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          <option value="50">Top 50</option>
          <option value="100" selected>Top 100</option>
          <option value="200">Top 200</option>
          <option value="500">Top 500</option>
          <option value="0">T\u1ea5t c\u1ea3 SKU</option>
        </select>
        <select id="upSort" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          <option value="top" selected>b\u00e1n ch\u1ea1y nh\u1ea5t</option>
          <option value="acc_high">accuracy cao nh\u1ea5t</option>
          <option value="acc_low">accuracy th\u1ea5p nh\u1ea5t</option>
        </select>
        <div style="width:1px;height:20px;background:#333"></div>
        <select id="upMonth" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          ${monthOpts}
        </select>
        <div style="width:1px;height:20px;background:#333"></div>
        <select id="upSeg" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">
          ${segOpts}
        </select>
        <div style="width:1px;height:20px;background:#333"></div>
        <input id="upSearch" type="text" placeholder="T\u00ecm SKU..." style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:12px;width:140px">
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span style="color:#555;font-size:10px" id="upInfo"></span>
          <button id="upExport" style="background:#1e293b;color:#10b981;border:1px solid #334155;border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;white-space:nowrap" title="T\u1ea3i CSV">\u2b07 T\u1ea3i CSV</button>
        </div>
      </div>`;

    ['upTopN','upMonth','upSeg','upSort'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyUpFilters);
    });
    let _searchTimer = null;
    document.getElementById('upSearch')?.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(applyUpFilters, CONFIG.DEBOUNCE_MS);
    });

    let _upLastDisplay = [];
    let _upLastMonths = [];

    function applyUpFilters() {
      _upFilters.topN = parseInt(document.getElementById('upTopN')?.value || '100');
      _upFilters.month = document.getElementById('upMonth')?.value || '';
      _upFilters.segment = document.getElementById('upSeg')?.value || '';
      _upFilters.search = (document.getElementById('upSearch')?.value || '').trim().toLowerCase();
      _upFilters.sort = document.getElementById('upSort')?.value || 'top';
      renderUpContent();
    }

    function renderUpContent() {
      const f = _upFilters;
      let filtered = enriched;
      if (f.segment) filtered = filtered.filter(r => r.segment === f.segment);
      if (f.search) filtered = filtered.filter(r => (r.sku || '').toLowerCase().includes(f.search));

      // If month filter, only show accuracy for that month
      const displayMonths = f.month ? months.filter(m => m === f.month) : months;

      // Re-compute per-SKU accuracy for filtered months
      const recomputed = filtered.map(r => {
        if (f.month) {
          const mm = f.month.slice(-2);
          const md = r._monthDetails[mm];
          return { ...r, _displayAcc: md ? md.acc * 100 : null };
        }
        return { ...r, _displayAcc: r._avgAcc };
      });

      // Sort
      if (f.sort === 'acc_high') {
        recomputed.sort((a, b) => (b._displayAcc ?? -999) - (a._displayAcc ?? -999));
      } else if (f.sort === 'acc_low') {
        recomputed.sort((a, b) => (a._displayAcc ?? 999) - (b._displayAcc ?? 999));
      } else {
        recomputed.sort((a, b) => (b._totalAct || 0) - (a._totalAct || 0));
      }

      // Apply topN
      let display = recomputed;
      if (f.topN > 0 && display.length > f.topN) display = display.slice(0, f.topN);

      // KPI
      const withAcc = display.filter(r => r._displayAcc != null);
      const avgAcc = withAcc.length > 0 ? withAcc.reduce((s, r) => s + r._displayAcc, 0) / withAcc.length : 0;
      const accGe80 = withAcc.filter(r => r._displayAcc >= 80).length;
      const accLt20 = withAcc.filter(r => r._displayAcc < 20).length;

      const infoEl = document.getElementById('upInfo');
      if (infoEl) infoEl.textContent = `${display.length} SKU \u00b7 ${displayMonths.length} th\u00e1ng`;

      let html = '';

      // KPI cards
      html += `<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:140px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Accuracy TB</div>
          <div style="font-size:2rem;font-weight:800;color:${accColor(avgAcc)};font-family:var(--mono)">${avgAcc.toFixed(1)}%</div>
        </div>
        <div style="flex:1;min-width:140px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">SKU</div>
          <div style="font-size:2rem;font-weight:800;color:#60a5fa;font-family:var(--mono)">${display.length}</div>
        </div>
        <div style="flex:1;min-width:140px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Acc \u2265 80%</div>
          <div style="font-size:2rem;font-weight:800;color:#10b981;font-family:var(--mono)">${accGe80}</div>
        </div>
        <div style="flex:1;min-width:140px;background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Acc < 20%</div>
          <div style="font-size:2rem;font-weight:800;color:#ef4444;font-family:var(--mono)">${accLt20}</div>
        </div>
      </div>`;

      // SKU table
      html += `<div style="background:#161820;border:1px solid #2a2d35;border-radius:12px;padding:16px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px">
          <thead><tr style="border-bottom:1px solid #2a2d35">
            <th style="text-align:left;padding:8px;color:#64748b">SKU</th>
            <th style="text-align:center;padding:8px;color:#64748b">Seg</th>
            <th style="text-align:right;padding:8px;color:#64748b">Accuracy</th>`;
      displayMonths.forEach(ym => { html += `<th style="text-align:center;padding:8px;color:#64748b;font-size:11px">${mLbl(ym)}</th>`; });
      html += `<th style="text-align:right;padding:8px;color:#64748b">\u03a3 Actual</th></tr></thead><tbody>`;

      display.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
        html += `<tr class="up-sku-row" data-sku="${r.sku}" style="border-bottom:1px solid #1e2938;background:${bg};cursor:pointer" title="Click \u0111\u1ec3 xem chi ti\u1ebft">
          <td style="padding:6px 8px;color:#e2e8f0;font-family:monospace;font-size:11px">${r.sku}</td>
          <td style="padding:6px;text-align:center;color:#888">${CONFIG.SEGMENT_SHORT[r.segment] || (r.segment||'').charAt(0).toUpperCase()}</td>
          <td style="padding:6px;text-align:right;color:${accColor(r._displayAcc||0)};font-weight:700">${r._displayAcc != null ? r._displayAcc.toFixed(0)+'%' : '-'}</td>`;
        displayMonths.forEach(ym => {
          const mm = ym.slice(-2);
          const md = r._monthDetails[mm];
          if (md) {
            const v = md.acc * 100;
            html += `<td style="padding:6px;text-align:center;font-size:11px;color:${accColor(v)};font-weight:600">${v.toFixed(0)}%</td>`;
          } else {
            html += `<td style="padding:6px;text-align:center;color:#444">-</td>`;
          }
        });
        html += `<td style="padding:6px;text-align:right;color:#94a3b8;font-size:11px">${fmt(r._totalAct)}</td></tr>`;
        // Detail row (hidden by default)
        html += `<tr class="up-detail-row" id="upDetail_${r.sku.replace(/\./g,'_')}" style="display:none">
          <td colspan="${3 + displayMonths.length + 1}" style="padding:0;background:#0d1117">
            <div class="up-detail-panel" style="padding:16px;border:1px solid #2a2d35;border-top:none;border-radius:0 0 8px 8px">
              <div style="text-align:center;color:#666;font-size:12px;padding:20px">
                <div class="spinner" style="margin:0 auto 8px"></div>\u0110ang t\u1ea3i d\u1eef li\u1ec7u...
              </div>
            </div>
          </td>
        </tr>`;
      });
      html += `</tbody></table></div>`;

      document.getElementById('upContent').innerHTML = html;
      _upLastDisplay = display;
      _upLastMonths = displayMonths;
      document.getElementById('upExport')?.addEventListener('click', exportUpCSV);

      // Click handler for SKU rows → expand detail with chart
      document.querySelectorAll('.up-sku-row').forEach(row => {
        row.addEventListener('click', async () => {
          const sku = row.dataset.sku;
          const detailId = 'upDetail_' + sku.replace(/\./g, '_');
          const detailRow = document.getElementById(detailId);
          if (!detailRow) return;
          // Toggle
          if (detailRow.style.display !== 'none') {
            detailRow.style.display = 'none';
            row.style.background = '';
            return;
          }
          // Collapse others
          document.querySelectorAll('.up-detail-row').forEach(r => r.style.display = 'none');
          document.querySelectorAll('.up-sku-row').forEach(r => r.style.background = '');
          detailRow.style.display = '';
          row.style.background = 'rgba(59,130,246,0.08)';

          // Find upload data for this SKU
          const skuData = enriched.find(r => r.sku === sku);
          const panel = detailRow.querySelector('.up-detail-panel');

          try {
            // Fetch chart data from API
            const chartData = await api('/api/sku_chart?sku=' + encodeURIComponent(sku));
            renderUploadSkuDetail(panel, sku, skuData, chartData, months);
          } catch (err) {
            panel.innerHTML = `<div style="color:#ef4444;padding:12px">\u274c ${err.message}</div>`;
          }
        });
      });
    }

    function exportUpCSV() {
      if (!_upLastDisplay.length) return;
      const headers = ['SKU', 'Segment', 'Accuracy'].concat(_upLastMonths.map(mLbl)).concat(['\u03a3 Actual']);
      const rows = _upLastDisplay.map(r => {
        const row = [r.sku, r.segment || '', r._displayAcc != null ? r._displayAcc.toFixed(1) + '%' : ''];
        _upLastMonths.forEach(ym => {
          const mm = ym.slice(-2);
          const md = r._monthDetails[mm];
          row.push(md ? (md.acc * 100).toFixed(1) + '%' : '');
        });
        row.push(r._totalAct);
        return row;
      });
      exportCSV(headers, rows, `upload_accuracy_${new Date().toISOString().slice(0,10)}.csv`);
    }

    // Initial render
    applyUpFilters();
  }

  // ── Render detail panel for a SKU in upload accuracy ──
  function renderUploadSkuDetail(panel, sku, uploadData, chartData, uploadMonths) {
    const monthly = (chartData.monthly || []).sort((a, b) => a.time.localeCompare(b.time));
    const fcMonths = chartData.forecast_months || [];
    const ma3Months = chartData.ma3_months || [];

    // Historical data (for computing MA3)
    const histByYM = {};
    monthly.forEach(m => { histByYM[m.time.slice(0, 7)] = m.value; });

    // System forecast by year_month
    const sysFcByYM = {};
    fcMonths.forEach(m => { sysFcByYM[m.time.slice(0, 7)] = m.value; });

    // MA3 from API
    const ma3ByYM = {};
    ma3Months.forEach(m => { ma3ByYM[m.time.slice(0, 7)] = m.value; });

    // User uploaded actual
    const userActByYM = {};
    if (uploadData) {
      uploadMonths.forEach(ym => {
        const mm = ym.slice(-2);
        const val = uploadData['act_' + mm];
        if (val != null) userActByYM[ym] = val;
      });
    }

    // Timeline = only upload months (sorted)
    const timeline = [...uploadMonths].sort();

    // For each month, compute MA3 from historical if API doesn't have it
    const allHistMonths = Object.keys(histByYM).sort();
    timeline.forEach(ym => {
      if (ma3ByYM[ym] == null) {
        // Compute rolling MA3 from 3 months before this month
        const idx = allHistMonths.indexOf(ym);
        if (idx >= 3) {
          const v1 = histByYM[allHistMonths[idx - 1]] || 0;
          const v2 = histByYM[allHistMonths[idx - 2]] || 0;
          const v3 = histByYM[allHistMonths[idx - 3]] || 0;
          ma3ByYM[ym] = (v1 + v2 + v3) / 3;
        } else if (idx === -1) {
          // Month not in history — try computing from last 3 known months
          const last3 = allHistMonths.slice(-3);
          if (last3.length === 3 && last3[2] < ym) {
            ma3ByYM[ym] = (histByYM[last3[0]] + histByYM[last3[1]] + histByYM[last3[2]]) / 3;
          }
        }
      }
    });

    // SVG chart — only forecast months
    const W = 600, H = 200, padL = 55, padR = 20, padT = 20, padB = 36;
    const cW = W - padL - padR, cH = H - padT - padB;

    // Collect all values for Y scale
    const allVals = [];
    timeline.forEach(ym => {
      if (sysFcByYM[ym] != null) allVals.push(sysFcByYM[ym]);
      if (ma3ByYM[ym] != null) allVals.push(ma3ByYM[ym]);
      if (userActByYM[ym] != null) allVals.push(userActByYM[ym]);
    });
    if (allVals.length === 0) allVals.push(0, 1);
    const minV = Math.min(0, ...allVals);
    const maxV = Math.max(1, ...allVals) * 1.15;

    const xPos = (i) => padL + (i / Math.max(timeline.length - 1, 1)) * cW;
    const yPos = (v) => padT + cH - ((v - minV) / (maxV - minV || 1)) * cH;

    // Build line + dots for a data series
    function buildLine(dataByYM, color, width, dashed) {
      const pts = [];
      timeline.forEach((ym, i) => {
        if (dataByYM[ym] != null) pts.push({ x: xPos(i), y: yPos(dataByYM[ym]), v: dataByYM[ym], ym });
      });
      if (pts.length < 1) return { path: '', dots: '' };
      const pathD = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
      const path = pts.length >= 2
        ? `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${width}" ${dashed ? 'stroke-dasharray="6,3"' : ''} opacity="0.9"/>`
        : '';
      const dots = pts.map(p => {
        const label = p.v >= 1000 ? (p.v/1000).toFixed(1) + 'K' : Math.round(p.v);
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${color}" stroke="#0d1117" stroke-width="2"/>
          <text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1) - 8}" text-anchor="middle" fill="${color}" font-size="9" font-weight="600">${label}</text>`;
      }).join('');
      return { path, dots };
    }

    const fcLine = buildLine(sysFcByYM, '#10b981', 2.5, false);
    const ma3Line = buildLine(ma3ByYM, '#f59e0b', 2, true);
    const userLine = buildLine(userActByYM, '#ef4444', 2.5, false);

    // Grid lines
    const nGrid = 4;
    let gridSvg = '';
    for (let i = 0; i <= nGrid; i++) {
      const v = minV + (maxV - minV) * i / nGrid;
      const y = yPos(v);
      gridSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
      gridSvg += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" fill="#475569" font-size="10">${v >= 1000 ? (v/1000).toFixed(0) + 'K' : Math.round(v)}</text>`;
    }

    // X labels — every month
    let xLabels = '';
    timeline.forEach((ym, i) => {
      const mm = parseInt(ym.slice(5));
      const yr = ym.slice(2, 4);
      xLabels += `<text x="${xPos(i)}" y="${H - 8}" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="600">T${mm}/${yr}</text>`;
    });

    const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto">
      ${gridSvg}${xLabels}
      ${fcLine.path}${ma3Line.path}${userLine.path}
      ${fcLine.dots}${ma3Line.dots}${userLine.dots}
    </svg>`;

    // Accuracy per month cards
    let accTable = '';
    if (uploadData && uploadData._monthDetails) {
      accTable = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">';
      uploadMonths.forEach(ym => {
        const mm = ym.slice(-2);
        const md = uploadData._monthDetails[mm];
        const fc = uploadData['fc_' + mm];
        const act = uploadData['act_' + mm];
        const ma3v = ma3ByYM[ym];
        const accVal = md ? (md.acc * 100).toFixed(0) : '-';
        const accClr = md ? (md.acc * 100 >= 80 ? '#10b981' : md.acc * 100 >= 50 ? '#60a5fa' : md.acc * 100 > 0 ? '#f59e0b' : '#ef4444') : '#666';
        accTable += `<div style="background:#161820;border:1px solid #2a2d35;border-radius:8px;padding:8px 12px;min-width:90px;text-align:center">
          <div style="color:#94a3b8;font-size:10px;margin-bottom:2px">T${parseInt(mm)}</div>
          <div style="color:${accClr};font-size:18px;font-weight:800">${accVal}%</div>
          <div style="color:#10b981;font-size:10px;margin-top:3px">FC: ${fc != null ? fmtNum(Math.round(fc)) : '-'}</div>
          <div style="color:#ef4444;font-size:10px">Act: ${act != null ? fmtNum(Math.round(act)) : '-'}</div>
          <div style="color:#f59e0b;font-size:10px">MA3: ${ma3v != null ? fmtNum(Math.round(ma3v)) : '-'}</div>
        </div>`;
      });
      accTable += '</div>';
    }

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="color:#fff;font-weight:700;font-size:13px">${sku}</span>
        <span style="color:#888;font-size:11px">${uploadData?.segment || ''} \u00b7 ${uploadData?.route || ''}</span>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:2;min-width:380px">
          <div style="display:flex;gap:14px;margin-bottom:8px;font-size:11px">
            <span><span style="display:inline-block;width:14px;height:3px;background:#10b981;vertical-align:middle;margin-right:4px;border-radius:2px"></span><span style="color:#10b981">Forecast</span></span>
            <span><span style="display:inline-block;width:14px;height:3px;background:#f59e0b;vertical-align:middle;margin-right:4px;border-radius:2px;border-bottom:1px dashed #f59e0b"></span><span style="color:#f59e0b">MA3</span></span>
            <span><span style="display:inline-block;width:14px;height:3px;background:#ef4444;vertical-align:middle;margin-right:4px;border-radius:2px"></span><span style="color:#ef4444">Th\u1ef1c t\u1ebf (upload)</span></span>
          </div>
          ${svg}
        </div>
        <div style="flex:1;min-width:200px">
          <div style="color:#94a3b8;font-size:11px;font-weight:600;margin-bottom:6px">\u0110\u1ED9 ch\u00ednh x\u00e1c theo th\u00e1ng</div>
          ${accTable}
        </div>
      </div>`;
  }
})();

function renderForecastDashboard(d) {
  const el = document.getElementById('forecastContent');
  const segColors = { 'ML_CANDIDATE': '#10b981', 'MA3_CANDIDATE': '#f59e0b', 'TOO_SPARSE': '#ef4444', 'COLD_START': '#3b82f6' };
  const segLabels = { 'ML_CANDIDATE': 'A', 'MA3_CANDIDATE': 'B', 'TOO_SPARSE': 'C', 'COLD_START': 'D' };

  // Section 1: KPI cards (6 compact cards — key numbers only)
  const pipeline = d.pipeline || {};
  const skuAcc = d.sku_accuracy || {};
  const overallWmape = skuAcc._overall ? skuAcc._overall.median_wmape : (skuAcc['ML_CANDIDATE'] || {}).median_wmape || '--';
  const gm = d.grand_monthly || {};
  const gm_keys = Object.keys(gm).sort();
  const totalVol = ((gm.total || Object.values(gm).reduce((s,v) => s + (typeof v === 'number' ? v : 0), 0)) / 1e6).toFixed(1);

  const excl = d.exclusion || {};
  const totalOrig = ['ML_CANDIDATE','MA3_CANDIDATE','TOO_SPARSE','COLD_START'].reduce((s,seg) => s + ((excl[seg]||{}).original||0), 0);
  const totalActive = ['ML_CANDIDATE','MA3_CANDIDATE','TOO_SPARSE','COLD_START'].reduce((s,seg) => s + ((excl[seg]||{}).active||0), 0);
  const totalExcluded = ['ML_CANDIDATE','MA3_CANDIDATE','TOO_SPARSE','COLD_START'].reduce((s,seg) => s + ((excl[seg]||{}).excluded||0), 0);

  const kpiHtml = `
    <div class="fc-section">
      <div class="fc-kpi-grid">
        <div class="chart-card fc-kpi"><span class="fc-kpi-val" style="color:#60a5fa">${fmtNum(pipeline.active_sku || totalActive)}</span><span class="fc-kpi-lbl">SKU Forecast</span></div>
        <div class="chart-card fc-kpi"><span class="fc-kpi-val" style="color:#ef4444">${fmtNum(pipeline.excluded_sku || totalExcluded)}</span><span class="fc-kpi-lbl">SKU Lo&#7841;i</span></div>
        <div class="chart-card fc-kpi"><span class="fc-kpi-val" style="color:#34d399">${totalVol}M</span><span class="fc-kpi-lbl">T&#7893;ng FC (${gm_keys.length} th\u00e1ng)</span></div>
        <div class="chart-card fc-kpi"><span class="fc-kpi-val" style="color:#fbbf24">${overallWmape != null && overallWmape !== '--' ? (100 - overallWmape).toFixed(1) : '--'}%</span><span class="fc-kpi-lbl">\u0110\u1ED9 CX (A)</span></div>
      </div>
    </div>`;

  // Section 2: SVG Area Chart — monthly forecast
  const months = gm_keys.length > 0 ? gm_keys : ['2025-09', '2025-10', '2025-11'];
  const monthLabels = months.map(m => { const [y,mo] = m.split('-'); return `Thg ${parseInt(mo)}`; });
  const monthVals = months.map(m => gm[m] || 0);
  const minV = Math.min(...monthVals) * 0.92;
  const maxV = Math.max(...monthVals, 1) * 1.05;
  const svgW = 780, svgH = 200, padL = 52, padR = 20, padT = 24, padB = 32;
  const chartW = svgW - padL - padR, chartH = svgH - padT - padB;
  const pts = monthVals.map((v, i) => ({
    x: padL + (i / (monthVals.length - 1)) * chartW,
    y: padT + chartH - ((v - minV) / (maxV - minV || 1)) * chartH,
    v
  }));
  // Smooth curve via cardinal spline
  function cardinalPts(points) {
    if (points.length < 2) return points.map(p => `${p.x},${p.y}`).join(' ');
    let path = `M${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
  }
  const linePath = cardinalPts(pts);
  const areaPath = linePath + ` L${pts[pts.length-1].x},${padT+chartH} L${pts[0].x},${padT+chartH} Z`;
  // Y-axis gridlines (3 lines)
  const yTicks = [0, 0.5, 1].map(f => {
    const val = minV + f * (maxV - minV);
    const y = padT + chartH - f * chartH;
    return { val, y };
  });
  const gridLines = yTicks.map(t =>
    `<line x1="${padL}" y1="${t.y}" x2="${svgW-padR}" y2="${t.y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4"/>
     <text x="${padL-8}" y="${t.y+4}" text-anchor="end" fill="rgba(255,255,255,0.35)" font-size="10" font-family="var(--mono)">${(t.val/1e6).toFixed(1)}M</text>`
  ).join('');
  // Distinguish forecast months (>= 2025-12) from historical
  const isForecastMonth = m => m >= '2025-12';
  const dotsSvg = pts.map((p, i) => {
    const isFc = isForecastMonth(months[i]);
    const dotColor = isFc ? '#f59e0b' : '#60a5fa';
    const labelSuffix = isFc ? ' (FC)' : '';
    return `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${dotColor}" stroke="#0c0e16" stroke-width="2.5"/>
     <text x="${p.x}" y="${p.y - 12}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="11" font-weight="700" font-family="var(--mono)">${(p.v/1e6).toFixed(1)}M</text>
     <text x="${p.x}" y="${padT+chartH+18}" text-anchor="middle" fill="${isFc ? 'rgba(245,158,11,0.7)' : 'rgba(255,255,255,0.45)'}" font-size="11">${monthLabels[i]}${labelSuffix}</text>`;
  }).join('');

  const monthlyHtml = `
    <div class="fc-section">
      <h3 class="fc-section-title">S&#7843;n l&#432;&#7907;ng d&#7921; b&aacute;o theo th&aacute;ng</h3>
      <div class="chart-card" style="padding:20px 16px">
        <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:auto;display:block">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.03"/>
            </linearGradient>
          </defs>
          ${gridLines}
          <path d="${areaPath}" fill="url(#areaGrad)"/>
          <path d="${linePath}" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round"/>
          ${dotsSvg}
        </svg>
      </div>
    </div>`;

  // Section 3: Segment — donut + proportion bar + details
  const models = d.model_assignment || [];
  const segList = ['ML_CANDIDATE', 'MA3_CANDIDATE', 'TOO_SPARSE', 'COLD_START'];
  const segData = segList.map(seg => {
    const sa = skuAcc[seg] || {};
    const ma = models.find(m => m.segment === seg) || {};
    const exSeg = excl[seg] || {};
    return { seg, col: segColors[seg], label: segLabels[seg], count: exSeg.active || sa.count || 0, model: ma.model || '--', wmape: sa.median_wmape, vol: (d.volume_share || {})[seg] || 0 };
  });
  const totalSku = segData.reduce((s, d) => s + d.count, 0) || 1;

  // Mini donut SVG
  const donutR = 36, donutStroke = 8;
  let donutOffset = 0;
  const donutCircum = 2 * Math.PI * donutR;
  const donutArcs = segData.map(s => {
    const pct = s.count / totalSku;
    const dash = pct * donutCircum;
    const gap = donutCircum - dash;
    const offset = -donutOffset * donutCircum;
    donutOffset += pct;
    return `<circle cx="44" cy="44" r="${donutR}" fill="none" stroke="${s.col}" stroke-width="${donutStroke}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${offset}" stroke-linecap="round" style="transform:rotate(-90deg);transform-origin:44px 44px"/>`;
  }).join('');

  const donutSvg = `<svg viewBox="0 0 88 88" style="width:88px;height:88px;flex-shrink:0">
    <circle cx="44" cy="44" r="${donutR}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${donutStroke}"/>
    ${donutArcs}
    <text x="44" y="42" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-size="14" font-weight="800" font-family="var(--mono)">${fmtNum(totalSku)}</text>
    <text x="44" y="55" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="8">SKU</text>
  </svg>`;

  // Proportion bar
  const propBar = `<div style="display:flex;height:10px;border-radius:5px;overflow:hidden;width:100%">${segData.map(s =>
    `<div style="flex:${s.count};background:${s.col}" title="Seg ${s.label}: ${fmtNum(s.count)}"></div>`
  ).join('')}</div>`;

  // Segment detail rows
  const segRows = segData.map(s => `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
      <span style="width:8px;height:8px;border-radius:50%;background:${s.col};flex-shrink:0"></span>
      <span style="font-weight:700;color:${s.col};min-width:28px">Seg ${s.label}</span>
      <span style="font-family:var(--mono);font-size:0.82rem;color:var(--text-1);min-width:60px">${fmtNum(s.count)} SKU</span>
      <span style="font-size:0.78rem;color:var(--text-3);min-width:50px">${Math.round(s.count/totalSku*100)}%</span>
      <span style="font-size:0.78rem;color:var(--text-2)">Model: <strong style="color:var(--text-1)">${s.model}</strong></span>
      <span style="margin-left:auto;font-family:var(--mono);font-size:0.82rem;color:${s.wmape != null && (100-s.wmape) >= 70 ? '#10b981' : s.wmape != null && (100-s.wmape) >= 40 ? '#f59e0b' : '#ef4444'}">${s.wmape != null ? (100-s.wmape).toFixed(1) + '% \u0110CX' : '--'}</span>
    </div>`).join('');

  const segHtml = `
    <div class="fc-section">
      <h3 class="fc-section-title">Segment</h3>
      <div class="chart-card" style="padding:24px">
        <div style="display:flex;gap:28px;align-items:center;flex-wrap:wrap">
          ${donutSvg}
          <div style="flex:1;min-width:280px">
            ${propBar}
            <div style="margin-top:14px">${segRows}</div>
          </div>
        </div>
      </div>
    </div>`;

  // Section 4: Baseline Comparison (MA3 vs V5 Model)
  let baselineHtml = '';
  const bc = d.baseline_comparison || {};
  if (bc.overall) {
    const ov = bc.overall;
    const segComp = bc.segments || {};
    const monthComp = bc.monthly || {};

    // Overall KPI — convert WMAPE to Accuracy (100 - WMAPE)
    const ma3W = ov.ma3.wmape;
    const v5W = ov.v5_model.wmape;
    const ma3Acc = (100 - ma3W).toFixed(1);
    const v5Acc = (100 - v5W).toFixed(1);
    const imp = ov.improvement_pct;

    // Per-segment rows
    const segCompRows = ['ML_CANDIDATE', 'MA3_CANDIDATE', 'TOO_SPARSE', 'COLD_START'].map(seg => {
      const sc = segComp[seg] || {};
      const sm = sc.ma3 || {};
      const sv = sc.v5_model || {};
      const si = sc.improvement_pct;
      const col = segColors[seg];
      const label = segLabels[seg];
      const sma3Acc = sm.wmape != null ? (100 - sm.wmape).toFixed(1) : null;
      const sv5Acc = sv.wmape != null ? (100 - sv.wmape).toFixed(1) : null;
      return `<tr>
        <td style="padding:6px 8px"><span style="color:${col};font-weight:700">Seg ${label}</span></td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--mono);color:#ef4444">${sma3Acc != null ? sma3Acc + '%' : '--'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--mono);color:#ef4444">${sm.bias != null ? (sm.bias > 0 ? '+' : '') + sm.bias + '%' : '--'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--mono);color:#10b981">${sv5Acc != null ? sv5Acc + '%' : '--'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--mono);color:#10b981">${sv.bias != null ? (sv.bias > 0 ? '+' : '') + sv.bias + '%' : '--'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--mono);font-weight:700;color:${si > 0 ? '#10b981' : si < 0 ? '#ef4444' : '#888'}">${si != null ? (si > 0 ? '+' : '') + si + '%' : '--'}</td>
      </tr>`;
    }).join('');

    // Monthly rows
    const monthCompRows = Object.entries(monthComp).map(([ym, mc]) => {
      const mm = mc.ma3 || {};
      const mv = mc.v5_model || {};
      const mi = mc.improvement_pct;
      const label = ym.replace('2025-', 'Thg ');
      const mma3Acc = mm.wmape != null ? (100 - mm.wmape).toFixed(1) : '--';
      const mv5Acc = mv.wmape != null ? (100 - mv.wmape).toFixed(1) : '--';
      return `<tr>
        <td style="padding:4px 8px;font-size:0.78rem;color:var(--text-2)">${label}</td>
        <td style="padding:4px 8px;text-align:right;font-family:var(--mono);font-size:0.78rem;color:#ef4444">${mma3Acc}%</td>
        <td style="padding:4px 8px;text-align:right;font-family:var(--mono);font-size:0.78rem;color:#10b981">${mv5Acc}%</td>
        <td style="padding:4px 8px;text-align:right;font-family:var(--mono);font-size:0.78rem;font-weight:600;color:#10b981">+${mi}%</td>
      </tr>`;
    }).join('');

    baselineHtml = `
    <div class="fc-section">
      <h3 class="fc-section-title">So s&aacute;nh: V5 Model vs MA3 (ph&#432;&#417;ng ph&aacute;p kh&aacute;ch h&agrave;ng)</h3>
      <div class="chart-card" style="padding:24px">
        <div style="display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:0.72rem;color:#ef4444;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">MA3 (Kh&aacute;ch)</div>
            <div style="font-size:1.8rem;font-weight:800;color:#ef4444;font-family:var(--mono)">${ma3Acc}%</div>
            <div style="font-size:0.72rem;color:var(--text-3)">&#272;&#7897; ch&iacute;nh x&aacute;c</div>
          </div>
          <div style="flex:1;min-width:200px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:0.72rem;color:#10b981;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">V5 Model</div>
            <div style="font-size:1.8rem;font-weight:800;color:#10b981;font-family:var(--mono)">${v5Acc}%</div>
            <div style="font-size:0.72rem;color:var(--text-3)">&#272;&#7897; ch&iacute;nh x&aacute;c</div>
          </div>
          <div style="flex:1;min-width:200px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:0.72rem;color:#60a5fa;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">C&#7843;i thi&#7879;n</div>
            <div style="font-size:1.8rem;font-weight:800;color:#60a5fa;font-family:var(--mono)">+${imp}%</div>
            <div style="font-size:0.72rem;color:var(--text-3)">t&#259;ng &#273;&#7897; ch&iacute;nh x&aacute;c</div>
          </div>
        </div>
        <div style="font-size:0.75rem;color:var(--text-3);margin-bottom:16px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:6px">
          ${bc.note || ''}
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div style="flex:2;min-width:340px">
            <h4 style="font-size:0.75rem;color:#60a5fa;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Theo Segment</h4>
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
              <thead><tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:6px 8px;color:var(--text-3);font-weight:500">Segment</th>
                <th style="text-align:right;padding:6px 8px;color:#ef4444;font-weight:500">MA3 &#272;CX</th>
                <th style="text-align:right;padding:6px 8px;color:#ef4444;font-weight:500">MA3 Bias</th>
                <th style="text-align:right;padding:6px 8px;color:#10b981;font-weight:500">V5 &#272;CX</th>
                <th style="text-align:right;padding:6px 8px;color:#10b981;font-weight:500">V5 Bias</th>
                <th style="text-align:right;padding:6px 8px;color:#60a5fa;font-weight:500">C&#7843;i thi&#7879;n</th>
              </tr></thead>
              <tbody>${segCompRows}</tbody>
            </table>
          </div>
          <div style="flex:1;min-width:220px">
            <h4 style="font-size:0.75rem;color:#60a5fa;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Theo Th&aacute;ng</h4>
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
              <thead><tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:4px 8px;color:var(--text-3);font-weight:500">Th&aacute;ng</th>
                <th style="text-align:right;padding:4px 8px;color:#ef4444;font-weight:500">MA3</th>
                <th style="text-align:right;padding:4px 8px;color:#10b981;font-weight:500">V5</th>
                <th style="text-align:right;padding:4px 8px;color:#60a5fa;font-weight:500">+%</th>
              </tr></thead>
              <tbody>${monthCompRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
  }

  // Section 5: Collapsible details (Insights + Exclusion info)
  const fixes = d.fixes || [];
  const lims = d.limitations || [];
  const recs = d.recommendations || [];
  let detailsHtml = '';
  if (fixes.length || lims.length || recs.length || totalExcluded > 0) {
    const funnelLine = totalExcluded > 0 ? `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:0.82rem;color:var(--text-2);border-bottom:1px solid var(--border);margin-bottom:12px">
      <span>${fmtNum(totalOrig)} t&#7893;ng</span><span style="color:var(--text-3)">&#8594;</span>
      <span style="color:#ef4444">-${fmtNum(totalExcluded)} lo&#7841;i</span><span style="color:var(--text-3)">&#8594;</span>
      <span style="color:#10b981;font-weight:700">${fmtNum(totalActive)} active</span>
    </div>` : '';
    const recItems = recs.map(r => `<div style="display:flex;align-items:baseline;gap:8px;font-size:0.78rem;margin-bottom:4px"><span style="color:${r.priority <= 2 ? '#10b981' : '#f59e0b'};font-weight:700;min-width:14px">${r.priority}</span><span style="color:var(--text-2)">${r.action}</span></div>`).join('');
    const limItems = lims.map(l => `<div style="font-size:0.78rem;color:var(--text-3);margin-bottom:4px">&#x2022; ${l}</div>`).join('');

    detailsHtml = `
    <div class="fc-section">
      <div class="fc-accordion" id="fcAccordion">
        <button class="fc-accordion-toggle" onclick="this.closest('.fc-accordion').classList.toggle('open')">
          <span class="fc-section-title" style="margin:0">Chi ti&#7871;t & Khuy&#7871;n ngh&#7883;</span>
          <span class="fc-accordion-arrow">&#9660;</span>
        </button>
        <div class="fc-accordion-body">
          <div style="padding:16px 20px">
            ${funnelLine}
            ${recItems ? '<div style="margin-bottom:12px"><h4 style="font-size:0.75rem;color:#60a5fa;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Khuy&#7871;n ngh&#7883;</h4>' + recItems + '</div>' : ''}
            ${limItems ? '<div><h4 style="font-size:0.75rem;color:#f59e0b;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">H&#7841;n ch&#7871;</h4>' + limItems + '</div>' : ''}
          </div>
        </div>
      </div>
    </div>`;
  }

  el.innerHTML = kpiHtml + monthlyHtml + segHtml + detailsHtml;
}

// ═══════════════════════════════════════════
// FORECAST TABLE
// ═══════════════════════════════════════════
function renderFcTable(data) {
  const thead = document.getElementById('fcTableHead');
  const tbody = document.getElementById('fcTableBody');

  // Detect V7 by checking first row for routing_decision
  const isV7 = data.rows && data.rows.length > 0 && data.rows[0].routing_decision !== undefined;

  const columns = [
    { key: 'sku', label: 'SKU', sortable: true },
    { key: 'segment', label: 'Segment', sortable: true },
    ...(isV7 ? [
      { key: 'best_model', label: 'Model', sortable: true },
      { key: 'routing_decision', label: 'Routing', sortable: true },
    ] : []),
    { key: 'accuracy_tier', label: 'Accuracy', sortable: true },
    { key: 'wmape', label: '\u0110\u1ED9 CX %', sortable: true },
    { key: 'forecast_08', label: 'Aug', sortable: true },
    { key: 'forecast_09', label: 'Sep', sortable: true },
    { key: 'forecast_10', label: 'Oct', sortable: true },
    { key: 'forecast_11', label: 'Nov', sortable: true },
    { key: 'forecast_12', label: 'Dec', sortable: true },
    { key: 'forecast_01', label: 'Jan', sortable: true },
    { key: 'forecast_02', label: 'Feb', sortable: true },
    { key: 'forecast_03', label: 'Mar', sortable: true },
    { key: '_total', label: 'Total', sortable: false },
    { key: 'bias', label: 'Bias', sortable: true },
    { key: 'hr30', label: 'HR30', sortable: true }
  ];

  // Header
  let headerHtml = '<tr>';
  columns.forEach(col => {
    if (!col.sortable) {
      headerHtml += `<th>${col.label}</th>`;
      return;
    }
    const sorted = STATE.fcFilters.sort_by === col.key;
    const arrow = sorted ? (STATE.fcFilters.sort_dir === 'asc' ? '&#9650;' : '&#9660;') : '&#9650;';
    const cls = sorted ? 'sorted' : '';
    headerHtml += `<th class="${cls}" data-fcsort="${col.key}">${col.label} <span class="sort-arrow">${arrow}</span></th>`;
  });
  headerHtml += '</tr>';
  thead.innerHTML = headerHtml;

  // Bind sort
  thead.querySelectorAll('th[data-fcsort]').forEach(th => {
    const sortKey = th.dataset.fcsort;
    if (!sortKey) return;
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      if (STATE.fcFilters.sort_by === sortKey) {
        STATE.fcFilters.sort_dir = STATE.fcFilters.sort_dir === 'asc' ? 'desc' : 'asc';
      } else {
        STATE.fcFilters.sort_by = sortKey;
        STATE.fcFilters.sort_dir = 'desc';
      }
      STATE.fcFilters.page = 1;
      loadFcDetail();
    });
  });

  // Body
  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="15" style="text-align:center;padding:40px;color:var(--text-3)">Kh&ocirc;ng c&oacute; d&#7919; li&#7879;u</td></tr>';
    updateFcPagination(data);
    return;
  }

  const segColors = { 'ML_CANDIDATE': '#10b981', 'MA3_CANDIDATE': '#f59e0b', 'TOO_SPARSE': '#ef4444', 'COLD_START': '#3b82f6' };
  const segShort = { 'ML_CANDIDATE': 'A', 'MA3_CANDIDATE': 'B', 'TOO_SPARSE': 'C', 'COLD_START': 'D' };
  const tierColors = { 'high': '#10b981', 'medium': '#3b82f6', 'low': '#f59e0b', 'poor': '#ef4444' };

  let bodyHtml = '';
  data.rows.forEach(row => {
    const f08 = Number(row.forecast_08) || 0;
    const f09 = Number(row.forecast_09) || 0;
    const f10 = Number(row.forecast_10) || 0;
    const f11 = Number(row.forecast_11) || 0;
    const f12 = Number(row.forecast_12) || 0;
    const f01 = Number(row.forecast_01) || 0;
    const f02 = Number(row.forecast_02) || 0;
    const f03 = Number(row.forecast_03) || 0;
    const total = f08 + f09 + f10 + f11 + f12 + f01 + f02 + f03;

    const seg = row.segment || '';
    const segCol = segColors[seg] || '#6b7280';
    const segLabel = segShort[seg] || seg.charAt(0) || '-';

    const tier = (row.accuracy_tier || '').toLowerCase();
    const tierCol = tierColors[tier] || '#6b7280';

    const wmape = row.wmape != null && row.wmape !== '' ? (100 - Number(row.wmape)).toFixed(1) : '-';
    const bias = row.bias != null && row.bias !== '' ? Number(row.bias).toFixed(1) : '-';
    const hr30 = row.hr30 != null && row.hr30 !== '' ? Number(row.hr30).toFixed(1) : '-';
    const fmtCell = v => v > 0 ? fmtNum(Math.round(v)) : '-';

    const routingColors = {'CONFIDENT':'#10b981','MARGINAL':'#f59e0b','FALLBACK_MA3':'#6b7280'};
    const routingShort = {'CONFIDENT':'C','MARGINAL':'M','FALLBACK_MA3':'F'};
    bodyHtml += `<tr>
      <td><span class="sku-link fc-sku-link" data-sku="${row.sku}" data-seg="${seg}">${row.sku}</span></td>
      <td><span class="fc-seg-badge" style="--badge-color:${segCol}">${segLabel}</span></td>
      ${isV7 ? `<td style="font-size:0.75rem;color:var(--text-2)">${(row.best_model||'-').replace('LGB_','L_')}</td>
      <td><span class="fc-tier-badge" style="--badge-color:${routingColors[row.routing_decision]||'#6b7280'}">${routingShort[row.routing_decision]||row.routing_decision||'-'}</span></td>` : ''}
      <td><span class="fc-tier-badge" style="--badge-color:${tierCol}">${tier || '-'}</span></td>
      <td class="qty-cell">${wmape}</td>
      <td class="qty-cell">${fmtCell(f08)}</td>
      <td class="qty-cell">${fmtCell(f09)}</td>
      <td class="qty-cell">${fmtCell(f10)}</td>
      <td class="qty-cell">${fmtCell(f11)}</td>
      <td class="qty-cell">${fmtCell(f12)}</td>
      <td class="qty-cell">${fmtCell(f01)}</td>
      <td class="qty-cell">${fmtCell(f02)}</td>
      <td class="qty-cell">${fmtCell(f03)}</td>
      <td class="qty-cell" style="font-weight:700">${total > 0 ? fmtNum(Math.round(total)) : '-'}</td>
      <td class="qty-cell">${bias}</td>
      <td class="qty-cell">${hr30}</td>
    </tr>`;
  });
  tbody.innerHTML = bodyHtml;

  // Bind SKU links -> Pulse tab
  tbody.querySelectorAll('.fc-sku-link').forEach(link => {
    link.addEventListener('click', () => {
      const sku = link.dataset.sku;
      const seg = link.dataset.seg || '';
      addPulseSku({ sku, product_name: sku, segment: seg });
      switchTab('pulse');
    });
  });

  updateFcPagination(data);
}

function updateFcPagination(data) {
  const total = data.total || 0;
  const page = data.page || 1;
  const perPage = data.per_page || 50;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = total > 0 ? (page - 1) * perPage + 1 : 0;
  const end = Math.min(page * perPage, total);

  document.getElementById('fcPageInfo').textContent = `${start}-${end} / ${fmtNum(total)} SKU`;
  document.getElementById('fcPageNum').textContent = `${page} / ${totalPages}`;
  document.getElementById('fcPrevPage').disabled = page <= 1;
  document.getElementById('fcNextPage').disabled = page >= totalPages;
}

// ═══════════════════════════════════════════
// SEGMENT EXPLAIN
// ═══════════════════════════════════════════
function initSegExplain() {
  const btn = document.getElementById('segExplainBtn');
  const panel = document.getElementById('segExplainPanel');
  if (!btn || !panel) return;

  btn.addEventListener('click', async () => {
    STATE.segExplainOpen = !STATE.segExplainOpen;
    btn.classList.toggle('open', STATE.segExplainOpen);

    if (STATE.segExplainOpen) {
      panel.style.display = '';
      if (!STATE.segExplainData) {
        try {
          STATE.segExplainData = await api('/api/segment_explain');
        } catch (err) {
          panel.innerHTML = '<div style="padding:20px;color:var(--text-3)">Error loading segment data</div>';
          return;
        }
      }
      renderSegExplain();
    } else {
      panel.style.display = 'none';
    }
  });
}

function renderSegExplain() {
  const panel = document.getElementById('segExplainPanel');
  const data = STATE.segExplainData;
  if (!data) return;

  const segOrder = ['ML_CANDIDATE', 'MA3_CANDIDATE', 'TOO_SPARSE', 'COLD_START'];
  const entries = segOrder.filter(s => data[s]).map(s => [s, data[s]]);
  panel.innerHTML = entries.map(([seg, info]) => {
    const color = CONFIG.SEGMENT_COLORS[seg] || '#6b7280';
    const stats = info.stats || {};
    const criteria = (info.criteria || []).map(c => `<li>${c}</li>`).join('');
    const canFc = info.can_forecast ? '<span style="color:#10b981;font-weight:600">&#10003; Forecast được</span>' : '<span style="color:#ef4444;font-weight:600">&#10007; Không đủ data forecast</span>';
    return `<div class="seg-explain-card" style="border-left-color:${color}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <h4 style="margin:0">${info.icon || ''} ${info.title || seg}</h4>
        ${canFc}
      </div>
      <div class="seg-ex-stats">${fmtNum(stats.count || 0)} SKUs &middot; ${(stats.vol_pct || 0).toFixed(1)}% volume${stats.routing ? ' &middot; Routing: ' + stats.routing : ''}</div>
      <div style="margin:8px 0 6px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Tiêu chí phân loại:</div>
      <ul style="margin:0 0 8px;padding-left:18px;color:#cbd5e1;font-size:12px;line-height:1.7">${criteria}</ul>
      <div class="seg-ex-model" style="color:#60a5fa;font-size:12px"><b>Model:</b> ${info.model || '-'}</div>
      <div class="seg-ex-why" style="color:#94a3b8;font-size:12px;margin-top:4px"><b>Chiến lược:</b> ${info.action || info.why || ''}</div>
      ${info.note ? '<div style="color:#475569;font-size:11px;margin-top:4px;font-style:italic">' + info.note + '</div>' : ''}
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// COMMAND PALETTE
// ═══════════════════════════════════════════
function initCommandPalette() {
  const overlay = document.getElementById('cmdOverlay');
  const input = document.getElementById('cmdInput');
  const resultsContainer = document.getElementById('cmdResults');

  function open() {
    overlay.style.display = '';
    input.value = '';
    input.focus();
    document.getElementById('cmdSkuResults').style.display = 'none';
  }
  function close() {
    overlay.style.display = 'none';
  }

  // Ctrl+K
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (overlay.style.display === 'none') open(); else close();
    }
    if (e.key === 'Escape') close();
  });

  // Click outside
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Search input focus shortcut
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('focus', () => {
      open();
      globalSearch.blur();
    });
  }

  // Command actions
  resultsContainer.addEventListener('click', (e) => {
    const item = e.target.closest('.cmd-item');
    if (!item) return;
    const action = item.dataset.action;
    if (!action) return;

    if (action.startsWith('tab:')) {
      switchTab(action.replace('tab:', ''));
    } else if (action === 'toggle-theme') {
      toggleDarkMode();
    } else if (action === 'export') {
      exportCSV();
    } else if (action.startsWith('sku:')) {
      const sku = action.replace('sku:', '');
      addPulseSku({ sku, product_name: '', segment: '' });
      switchTab('pulse');
    }
    close();
  });

  // SKU search in palette
  let cmdTimeout;
  input.addEventListener('input', () => {
    clearTimeout(cmdTimeout);
    const q = input.value.trim();
    if (q.length < 2) {
      document.getElementById('cmdSkuResults').style.display = 'none';
      return;
    }
    cmdTimeout = setTimeout(async () => {
      try {
        const data = await api('/api/sku_search', { q, limit: 8 });
        const skuGroup = document.getElementById('cmdSkuResults');
        if (data.results && data.results.length > 0) {
          skuGroup.style.display = '';
          skuGroup.innerHTML = `<div class="cmd-group-title">SKU</div>` +
            data.results.map(s =>
              `<div class="cmd-item" data-action="sku:${s.sku}">${s.sku} — ${esc((s.product_name || '').substring(0, 50))}</div>`
            ).join('');
        } else {
          skuGroup.style.display = 'none';
        }
      } catch (e) { /* ignore */ }
    }, CONFIG.DEBOUNCE_MS);
  });
}

// ═══════════════════════════════════════════
// THEME (fixed light — no toggle)
// ═══════════════════════════════════════════
function initDarkMode() {
  // Fixed light theme — no toggle
}

function toggleDarkMode() {
  // No-op: single theme
}

// ═══════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════
function initSearch() {
  const input = document.getElementById('globalSearch');
  // Direct search input (if command palette not used)
  // Actually handled via command palette, but also allow direct typing
  // We'll repurpose this: if user types and presses Enter, filter table
  // No-op: the globalSearch focuses the command palette
}

// ═══════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════
function initExport() {
  document.getElementById('exportBtn').addEventListener('click', exportCSV);
}

async function exportCSV() {
  showToast('Preparing export...', 'info');
  try {
    const params = { ...STATE.filters, page: 1, per_page: 9999 };
    const data = await api('/api/skus', params);
    if (!data.rows || data.rows.length === 0) {
      showToast('No data to export', 'info');
      return;
    }

    const months = data.months || STATE.monthCols;
    const headers = FIXED_COLS.map(c => c.label).concat(months);
    const csvRows = [headers.join(',')];

    data.rows.forEach(row => {
      const cells = FIXED_COLS.map(col => {
        const v = row[col.key];
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') ? `"${s}"` : s;
      });
      months.forEach(m => {
        cells.push(row.monthly ? (row.monthly[m] || 0) : 0);
      });
      csvRows.push(cells.join(','));
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unis_forecast_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export complete', 'success');
  } catch (err) {
    console.error('Export error:', err);
    showToast('Export failed', 'error');
  }
}

// ═══════════════════════════════════════════
// CSV EXPORT UTILITY
// ═══════════════════════════════════════════
function exportCSV(headers, rows, filename) {
  const esc = v => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [headers.map(esc).join(',')];
  rows.forEach(r => lines.push(r.map(esc).join(',')));
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Đã tải Excel/CSV', 'success');
}

// ═══════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
function fmtNum(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString('en-US');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════
// INTERACTIVE GUIDE SYSTEM
// ═══════════════════════════════════════════
const GUIDE_DATA = {
  'sku-list': {
    title: 'Tổng quan — Nhìn toàn bộ tình hình sản phẩm',
    steps: [
      { title: 'Trang này để làm gì?', badge: 'Giới thiệu',
        html: `<p>Đây là <span class="guide-highlight">trang chính</span> — giống như bảng điều khiển trong phòng điều hành. Bạn vào đây để nắm nhanh tình hình toàn bộ 7,056 mã sản phẩm gạch UNIS.</p>
          <p>Trang này trả lời các câu hỏi:</p>
          <div class="guide-method-box"><ul>
            <li>Hiện có bao nhiêu sản phẩm đang kinh doanh?</li>
            <li>Bao nhiêu sản phẩm hệ thống có thể dự báo được nhu cầu?</li>
            <li>Sản phẩm nào bất thường cần kiểm tra (ví dụ: đã ngừng nhưng vẫn xuất kho)?</li>
            <li>Sản phẩm phân bố ra sao: nhóm nào bán đều, nhóm nào bán rải rác?</li>
          </ul></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span>Trang này chỉ hiển thị <strong>biểu đồ và con số tổng hợp</strong>. Muốn xem chi tiết từng sản phẩm thì sang tab "Chi tiết".</span></div>` },
      { title: 'Đọc các con số trên cùng', badge: 'Chỉ số',
        html: `<p>Hàng đầu tiên là <span class="guide-highlight">5 ô số liệu quan trọng nhất</span>:</p>
          <div class="guide-method-box"><h4>Tổng SKU (7,056)</h4><p>Tổng số mã sản phẩm trong hệ thống. Mỗi "SKU" là 1 mã hàng cụ thể, ví dụ "Gạch ốp 30x60 trắng ngà" có 1 mã riêng.</p></div>
          <div class="guide-method-box"><h4>Forecastable (3,810)</h4><p>Số sản phẩm mà hệ thống <strong>có thể dự báo</strong> được. Đây là những sản phẩm có đủ dữ liệu bán hàng để máy "học" được quy luật.</p></div>
          <div class="guide-method-box"><h4>Not Forecastable (3,246)</h4><p>Sản phẩm <strong>không đủ dữ liệu</strong> để dự báo — ví dụ sản phẩm quá mới (vừa ra 1-2 tháng), hoặc đã ngừng bán lâu rồi.</p></div>
          <div class="guide-method-box"><h4>ACT / END / NEW</h4><p><strong>ACT</strong> = đang kinh doanh. <strong>END</strong> = đã ngừng sản xuất. <strong>NEW</strong> = sản phẩm mới. Đây là trạng thái do phòng kinh doanh cập nhật.</p></div>` },
      { title: 'Hệ thống chia sản phẩm thành 6 nhóm', badge: 'Phương pháp chia nhóm',
        html: `<p>Hệ thống phân tích lịch sử bán hàng 31 tháng và <span class="guide-highlight">tự động xếp mỗi sản phẩm vào 1 trong 6 nhóm</span>. Cách chia dựa trên 2 câu hỏi đơn giản:</p>
          <div class="guide-method-box"><h4>Câu hỏi 1: Sản phẩm bán có đều không?</h4>
          <p>Hệ thống đếm: trung bình bao nhiêu tháng mới có 1 lần bán?</p>
          <ul>
            <li>Nếu <strong>gần như tháng nào cũng bán</strong> → "Bán đều"</li>
            <li>Nếu <strong>có tháng bán có tháng không</strong> → "Bán rải rác"</li>
          </ul></div>
          <div class="guide-method-box"><h4>Câu hỏi 2: Mỗi lần bán, số lượng có ổn định không?</h4>
          <p>Ví dụ: tháng này bán 100, tháng sau bán 500 → biến động lớn. Tháng nào cũng quanh 200 → ổn định.</p>
          <ul>
            <li><strong>Ổn định</strong> → dự báo dễ hơn</li>
            <li><strong>Biến động</strong> → dự báo khó hơn</li>
          </ul></div>
          <div class="guide-method-box"><h4>Kết hợp lại thành 6 nhóm</h4>
          <ul>
            <li><strong style="color:#10b981">Nhóm A</strong> — Bán đều + ổn định → Dễ dự báo nhất</li>
            <li><strong style="color:#f59e0b">Nhóm B</strong> — Bán rải rác hoặc biến động → Khó hơn nhưng vẫn dự báo được</li>
            <li><strong style="color:#e67e22">Nhóm C1</strong> — Sản phẩm còn mới (3-5 tháng), chưa đủ dữ liệu</li>
            <li><strong style="color:#e74c3c">Nhóm C2</strong> — Có dữ liệu nhưng đã lâu không bán</li>
            <li><strong style="color:#3498db">Nhóm D1</strong> — Rất mới (1-2 tháng), vừa ra mắt</li>
            <li><strong style="color:#9b59b6">Nhóm D2</strong> — Rất ít dữ liệu và không còn bán</li>
          </ul></div>
          <div class="guide-tip"><span class="guide-tip-icon">⚠️</span><span>6 nhóm này dùng ở trang Tổng quan và Chi tiết. Sang trang Forecast sẽ gộp lại thành <span class="guide-warn">3 nhóm (A/B/C)</span> — sẽ giải thích ở guide của tab Forecast.</span></div>` },
      { title: 'Biểu đồ vòng đời sản phẩm', badge: 'Lifecycle',
        html: `<p>Biểu đồ "Lifecycle" cho bạn biết <span class="guide-highlight">sản phẩm đang ở giai đoạn nào của vòng đời</span>:</p>
          <div class="guide-method-box"><h4>Cách hệ thống xác định vòng đời</h4>
          <p>Hệ thống nhìn vào sản lượng bán <strong>3 quý gần nhất</strong> rồi so sánh:</p>
          <ul>
            <li><strong>Growing (Đang tăng)</strong> — Quý sau bán nhiều hơn quý trước. Ví dụ: Q1 bán 100, Q2 bán 150, Q3 bán 200. Sản phẩm đang được thị trường đón nhận.</li>
            <li><strong>Mature (Ổn định)</strong> — Sản lượng ít thay đổi qua các quý. Sản phẩm đã có chỗ đứng trên thị trường.</li>
            <li><strong>Declining (Đang giảm)</strong> — Quý sau bán ít hơn quý trước. Cần theo dõi, có thể cần chương trình kích cầu hoặc xem xét ngừng.</li>
            <li><strong>Dead (Ngừng)</strong> — Không còn bán nữa. Nhiều tháng liên tiếp = 0.</li>
            <li><strong>New (Mới)</strong> — Vừa xuất hiện, chưa đủ dữ liệu để đánh giá xu hướng.</li>
          </ul></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span>Bạn nên đặc biệt chú ý nhóm <strong>Declining</strong> — đây là những sản phẩm cần review: nên giữ, giảm sản xuất, hay ngừng hẳn?</span></div>` },
      { title: 'Cảnh báo bất thường', badge: 'Alerts',
        html: `<p>Dashboard có <span class="guide-highlight">2 cảnh báo</span> giúp phát hiện vấn đề:</p>
          <div class="guide-method-box"><h4>Cảnh báo 1: "ACT nhưng không bán"</h4>
          <p>Sản phẩm vẫn được đánh dấu là <strong>đang kinh doanh (ACT)</strong> nhưng thực tế <strong>nhiều tháng không có giao dịch xuất kho</strong>. Có thể: hàng tồn kho không xoay, kênh phân phối gặp vấn đề, hoặc cần cập nhật lại trạng thái.</p></div>
          <div class="guide-method-box"><h4>Cảnh báo 2: "Đã ngừng nhưng vẫn xuất kho"</h4>
          <p>Sản phẩm bị đánh dấu <strong>ngừng (END)</strong> nhưng vẫn có giao dịch xuất kho gần đây. Có thể: thanh lý tồn kho, trạng thái chưa cập nhật đúng, hoặc đại lý vẫn đặt hàng.</p></div>
          <div class="guide-tip"><span class="guide-tip-icon">👆</span><span><strong>Bấm vào cảnh báo</strong> → hệ thống tự chuyển sang tab Chi tiết và lọc ra đúng nhóm sản phẩm đó để bạn xem danh sách cụ thể.</span></div>
          <div class="guide-method-box"><h4>Mẹo nhanh</h4>
          <ul>
            <li><strong>Ctrl+K</strong> — Bấm tổ hợp phím này ở bất kỳ đâu để mở ô tìm kiếm nhanh, gõ mã sản phẩm cần tìm</li>
            <li><strong>Bấm logo UNIS</strong> — Quay lại trang giới thiệu ban đầu</li>
          </ul></div>` }
    ],
    glossary: [
      { term: 'SKU', def: 'Stock Keeping Unit — mã sản phẩm. Mỗi SKU là 1 sản phẩm cụ thể với kích thước, màu sắc riêng. Ví dụ: "Gạch ốp 30x60 trắng ngà" và "Gạch ốp 30x60 ghi xám" là 2 SKU khác nhau' },
      { term: 'ACT / END / NEW', def: 'Trạng thái sản phẩm: ACT = đang kinh doanh bình thường, END = đã ngừng sản xuất/kinh doanh, NEW = sản phẩm mới đưa vào' },
      { term: 'Forecastable', def: 'Sản phẩm có đủ dữ liệu bán hàng (ít nhất vài tháng, có quy luật) để hệ thống có thể dự báo nhu cầu tương lai' },
      { term: 'Segment (Phân khúc)', def: 'Chia 4 nhóm dựa vào lịch sử bán hàng: A (ML Candidate) ≥12 tháng → ML forecast, B (MA3 Candidate) 3-11 tháng → lightweight ML, C (Too Sparse) <3 tháng → MA3 fallback, D (Cold Start) 0 tháng → không đủ data. Bấm "Giải thích phân khúc" trên Dashboard để xem chi tiết.' },
      { term: 'Lifecycle (Vòng đời)', def: 'Giai đoạn sản phẩm: Growing = đang tăng trưởng, Mature = ổn định, Declining = đang suy giảm, Dead = ngừng, New = mới' },
      { term: 'Sparsity (Độ thưa)', def: 'Tỉ lệ % số tháng KHÔNG có bán. Ví dụ: sparsity 60% nghĩa là trong 31 tháng, có 19 tháng sản phẩm đó bán = 0' },
      { term: 'Verdict (Kết luận)', def: 'Kết luận tổng hợp: Forecastable = dự báo được, Marginal = vùng ranh giới (có thể dự báo nhưng độ chính xác trung bình), Not Forecastable = không đủ dữ liệu để dự báo' },
    ]
  },

  'detail': {
    title: 'Chi tiết — Xem từng sản phẩm',
    steps: [
      { title: 'Trang này để làm gì?', badge: 'Giới thiệu',
        html: `<p>Đây là <span class="guide-highlight">bảng dữ liệu chi tiết</span> của toàn bộ 7,056 sản phẩm. Bạn có thể:</p>
          <div class="guide-method-box"><ul>
            <li>Xem thông tin đầy đủ của từng sản phẩm: trạng thái, phân nhóm, sản lượng, điểm đánh giá</li>
            <li>Lọc theo nhiều tiêu chí cùng lúc để tìm đúng nhóm sản phẩm cần quan tâm</li>
            <li>Sắp xếp theo bất kỳ cột nào (ví dụ: sản phẩm bán nhiều nhất, sản phẩm mới nhất...)</li>
            <li>Xem sản lượng bán hàng thực tế từng tháng trong 31 tháng qua</li>
            <li>Bấm vào mã sản phẩm để xem biểu đồ chi tiết ở tab Pulse</li>
          </ul></div>` },
      { title: 'Cách dùng bộ lọc', badge: 'Bộ lọc',
        html: `<p>Phía trên bảng có <span class="guide-highlight">4 hàng nút lọc</span>. Bấm vào nút nào thì chỉ hiển thị sản phẩm thuộc nhóm đó:</p>
          <div class="guide-method-box"><h4>Hàng 1 — Trạng thái quản lý</h4>
          <p>Lọc theo trạng thái phòng kinh doanh cập nhật:</p>
          <ul>
            <li><strong>ACT</strong> — Sản phẩm đang kinh doanh</li>
            <li><strong>END</strong> — Đã ngừng sản xuất/kinh doanh</li>
            <li><strong>NEW</strong> — Sản phẩm mới</li>
          </ul></div>
          <div class="guide-method-box"><h4>Hàng 2 — Tình trạng thực tế</h4>
          <p>Kết hợp trạng thái quản lý + hành vi thực tế:</p>
          <ul>
            <li><strong>Active</strong> — Đang bán bình thường</li>
            <li><strong>Inactive</strong> — Trạng thái ACT nhưng thực tế không có giao dịch gần đây</li>
            <li><strong>StillSelling</strong> — Trạng thái END nhưng vẫn có xuất kho</li>
            <li><strong>Discontinued</strong> — Đã ngừng hoàn toàn</li>
          </ul></div>
          <div class="guide-method-box"><h4>Hàng 3 — Vòng đời + Kết luận</h4>
          <p>Lọc theo giai đoạn vòng đời (Growing/Mature/Declining/Dead/New) hoặc kết luận dự báo (Forecastable/Marginal/Not Forecastable)</p></div>
          <div class="guide-method-box"><h4>Hàng 4 — Phân nhóm + Dự báo</h4>
          <p>Lọc theo 6 nhóm phân tích (A/B/C1/C2/D1/D2) hoặc xem riêng sản phẩm dự báo được (Yes) / không (No)</p></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span>Bạn có thể <strong>kết hợp nhiều bộ lọc</strong> cùng lúc. Ví dụ: chọn ACT + Declining + nhóm A → ra danh sách sản phẩm đang kinh doanh nhưng sản lượng đang giảm, thuộc nhóm dự báo tốt nhất.</span></div>` },
      { title: 'Đọc bảng dữ liệu', badge: 'Bảng',
        html: `<p>Bảng có <span class="guide-highlight">20 cột chính</span> + các cột sản lượng từng tháng (kéo ngang để xem):</p>
          <div class="guide-method-box"><h4>Các cột quan trọng nhất</h4>
          <ul>
            <li><strong>SKU</strong> — Mã sản phẩm. <span class="guide-highlight">Bấm vào đây</span> để xem biểu đồ chi tiết ở tab Pulse.</li>
            <li><strong>Product</strong> — Tên sản phẩm (rút gọn, rê chuột lên để xem đầy đủ)</li>
            <li><strong>Segment</strong> — Nhóm phân tích (A/B/C1/C2/D1/D2), hiển thị bằng nhãn màu</li>
            <li><strong>Total Qty</strong> — Tổng sản lượng bán trong 31 tháng. Con số này cho biết sản phẩm bán được nhiều hay ít</li>
            <li><strong>Score</strong> — Điểm đánh giá khả năng dự báo (0-100). Càng cao = dữ liệu càng tốt, dự báo càng chính xác</li>
          </ul></div>
          <div class="guide-method-box"><h4>Các cột sản lượng tháng</h4>
          <p>Phía bên phải là sản lượng bán thực tế mỗi tháng từ 01/2023 đến 07/2025. Dấu "-" = tháng đó không bán được gì. Dùng để nhìn nhanh xu hướng: bán đều hay lúc có lúc không.</p></div>
          <div class="guide-tip"><span class="guide-tip-icon">👆</span><span><strong>Bấm vào tiêu đề cột</strong> để sắp xếp. Ví dụ: bấm "Total Qty" để xem sản phẩm bán nhiều nhất lên đầu.</span></div>` },
      { title: 'Cách hệ thống phân tích dữ liệu', badge: 'Phương pháp',
        html: `<p>Dữ liệu trong bảng này được xử lý qua <span class="guide-highlight">4 bước tự động</span>:</p>
          <div class="guide-method-box"><h4>Bước 1: Thu thập dữ liệu gốc</h4>
          <p>Hệ thống lấy toàn bộ <strong>588,000 giao dịch xuất kho</strong> trong 31 tháng (01/2023 → 07/2025), bao gồm: mã hàng, số lượng, ngày, chi nhánh, khách hàng. Dữ liệu bị lỗi (số lượng âm, trùng lặp) được loại bỏ.</p></div>
          <div class="guide-method-box"><h4>Bước 2: Tổng hợp theo tháng</h4>
          <p>Gộp tất cả giao dịch cùng 1 mã hàng trong 1 tháng lại thành 1 con số sản lượng. Kết quả: mỗi sản phẩm có 31 ô sản lượng (1 ô / tháng).</p></div>
          <div class="guide-method-box"><h4>Bước 3: Đánh giá đặc điểm nhu cầu</h4>
          <p>Hệ thống tính cho mỗi sản phẩm:</p>
          <ul>
            <li><strong>Bán có đều không?</strong> — Đếm bao nhiêu tháng có bán / bao nhiêu tháng = 0</li>
            <li><strong>Mỗi lần bán có ổn không?</strong> — So sánh sản lượng giữa các tháng: tháng nào cũng giống nhau = ổn, chênh lệch lớn = biến động</li>
            <li><strong>Xu hướng ra sao?</strong> — So quý gần nhất với quý trước: tăng, giảm, hay giữ nguyên?</li>
          </ul></div>
          <div class="guide-method-box"><h4>Bước 4: Phân nhóm tự động</h4>
          <p>Dựa trên kết quả bước 3, mỗi sản phẩm được xếp vào 1 trong 6 nhóm (A/B/C1/C2/D1/D2), gán điểm forecastability (0-100), xác định vòng đời, và đưa ra kết luận dự báo được hay không.</p></div>` },
      { title: 'Các tình huống sử dụng phổ biến', badge: 'Ví dụ thực tế',
        html: `<div class="guide-method-box"><h4>Tình huống 1: Tìm sản phẩm quan trọng đang giảm</h4>
          <p>Chọn lọc: <strong>ACT + Declining</strong> → Sắp xếp <strong>Total Qty giảm dần</strong></p>
          <p>Bạn sẽ thấy những sản phẩm đang kinh doanh, bán được nhiều nhưng sản lượng đang giảm → cần xem lại chiến lược.</p></div>
          <div class="guide-method-box"><h4>Tình huống 2: Kiểm tra sản phẩm bất thường</h4>
          <p>Chọn lọc: <strong>END + StillSelling</strong></p>
          <p>Đây là nhóm đã ngừng kinh doanh nhưng vẫn có xuất kho → bấm vào mã sản phẩm để xem biểu đồ ở Pulse.</p></div>
          <div class="guide-method-box"><h4>Tình huống 3: Xem sản phẩm mới</h4>
          <p>Chọn lọc: <strong>Segment D1</strong> hoặc <strong>Lifecycle: New</strong></p>
          <p>Danh sách sản phẩm mới ra mắt 1-2 tháng, chưa đủ dữ liệu dự báo.</p></div>
          <div class="guide-tip"><span class="guide-tip-icon">⌨️</span><span>Bấm <strong>Ctrl+K</strong> để tìm nhanh 1 mã sản phẩm cụ thể mà không cần lọc.</span></div>` }
    ],
    glossary: [
      { term: 'SKU', def: 'Mã sản phẩm — mỗi sản phẩm cụ thể (kích thước, màu riêng) có 1 mã SKU duy nhất' },
      { term: 'F_SKU', def: 'Mã nhóm sản phẩm — nhiều SKU thuộc cùng 1 dòng sản phẩm. Ví dụ: Gạch 60x60 có nhiều màu, mỗi màu 1 SKU nhưng cùng 1 F_SKU' },
      { term: 'Segment (Nhóm)', def: 'A = bán đều và ổn, B = bán rải rác hoặc biến động, C1 = mới ít dữ liệu, C2 = cũ đã ngừng bán, D1 = rất mới, D2 = rất ít và ngừng' },
      { term: 'Forecastability Score', def: 'Điểm 0-100 đánh giá khả năng dự báo. Trên 50 = tốt. 30-50 = tạm được. Dưới 30 = không đủ dữ liệu' },
      { term: 'Sparsity % (Độ thưa)', def: 'Bao nhiêu % số tháng không có bán. Ví dụ: Sparsity 60% = trong 31 tháng, có 19 tháng không bán. Càng cao = càng khó dự báo' },
      { term: 'Total Qty (Tổng SL)', def: 'Tổng sản lượng bán trong 31 tháng lịch sử. Dùng để đánh giá tầm quan trọng của sản phẩm' },
      { term: 'Verdict (Kết luận)', def: 'Forecastable = hệ thống dự báo được, Marginal = dự báo được nhưng độ tin cậy trung bình, Not Forecastable = không đủ dữ liệu' },
      { term: 'Lifecycle (Vòng đời)', def: 'Growing = đang tăng, Mature = ổn định, Declining = đang giảm, Dead = ngừng, New = mới ra' },
    ]
  },

  'forecast': {
    title: 'Dự báo — Kết quả Aug 2025 – Mar 2026 (8 tháng)',
    steps: [
      { title: 'Trang này để làm gì?', badge: 'Giới thiệu',
        html: `<p>Đây là <span class="guide-highlight">trang quan trọng nhất cho kinh doanh</span>. Trang này hiển thị kết quả dự báo nhu cầu xuất kho <strong>8 tháng</strong> (Aug 2025 → Mar 2026), bao gồm Tết Nguyên Đán 2026.</p>
          <p>Bạn dùng trang này để:</p>
          <div class="guide-method-box"><ul>
            <li>Xem tổng sản lượng dự báo từng tháng</li>
            <li>Biết sản phẩm nào được dự báo, sản phẩm nào bị loại và tại sao</li>
            <li>Đánh giá độ chính xác của dự báo (hệ thống đã kiểm tra trước)</li>
            <li>Tra cứu số dự báo cụ thể cho từng mã sản phẩm</li>
          </ul></div>
          <div class="guide-tip"><span class="guide-tip-icon">⚠️</span><span>Trang này chia sản phẩm thành <span class="guide-warn">3 nhóm (A/B/C)</span> thay vì 6 nhóm như trang Chi tiết. Lý do sẽ giải thích ở bước tiếp theo.</span></div>` },
      { title: 'Tại sao ở đây chỉ có 3 nhóm (A/B/C)?', badge: 'Phân nhóm dự báo',
        html: `<p>Trang Chi tiết chia 6 nhóm để <strong>phân tích chi tiết</strong>. Trang Forecast gộp lại còn <span class="guide-highlight">3 nhóm</span> vì mục đích khác: <strong>chọn phương pháp dự báo phù hợp</strong> cho mỗi nhóm.</p>
          <div class="guide-method-box"><h4 style="color:#10b981">Nhóm A — Bán đều, dự báo tốt (1,939 sản phẩm)</h4>
          <p>Đây là nhóm "ngôi sao" — bán thường xuyên, sản lượng ổn định. Chiếm <strong>~84% tổng sản lượng</strong>. Hệ thống dự báo nhóm này với sai số chỉ ~1.76%.</p>
          <p><em>Ví dụ: Gạch ốp 60x60 trắng — tháng nào cũng bán 500-600 thùng</em></p></div>
          <div class="guide-method-box"><h4 style="color:#f59e0b">Nhóm B — Bán rải rác, khó hơn (1,153 sản phẩm)</h4>
          <p>Sản phẩm có nhu cầu nhưng không đều — có tháng bán nhiều, có tháng không bán gì. Sai số dự báo cao hơn (~11%).</p>
          <p><em>Ví dụ: Gạch viền trang trí — chỉ bán khi có dự án xây dựng đặt hàng</em></p></div>
          <div class="guide-method-box"><h4 style="color:#ef4444">Nhóm C — Rất ít dữ liệu + sản phẩm mới (718 sản phẩm)</h4>
          <p>Gồm sản phẩm rất ít giao dịch và 469 sản phẩm mới ra mắt. Dự báo dựa trên trung bình sản lượng gần nhất.</p>
          <p><em>Ví dụ: Gạch mẫu mới ra tháng 5 — mới có 2-3 tháng dữ liệu</em></p></div>
          <div class="guide-method-box"><h4>Còn 3,246 sản phẩm không được dự báo</h4>
          <p>Đây là sản phẩm đã ngừng kinh doanh, không có giao dịch năm 2025, hoặc quá ít dữ liệu. Hệ thống bỏ qua vì dự báo sẽ không có ý nghĩa.</p></div>` },
      { title: 'Hệ thống dự báo hoạt động như thế nào?', badge: 'Quy trình',
        html: `<p>Quy trình dự báo gồm <span class="guide-highlight">7 bước</span>, giải thích đơn giản:</p>
          <div class="guide-method-box"><h4>1. Làm sạch dữ liệu</h4>
          <p>Lấy 588,000 giao dịch → loại bỏ dữ liệu lỗi (số âm, trùng lặp) → tổng hợp sản lượng theo tháng cho mỗi sản phẩm.</p></div>
          <div class="guide-method-box"><h4>2. Phân nhóm (A/B/C)</h4>
          <p>Dựa trên tần suất và độ ổn định của nhu cầu. <strong>Quan trọng</strong>: hệ thống chỉ dùng dữ liệu <em>trước tháng 1/2025</em> để phân nhóm, tránh "nhìn trước đáp án".</p></div>
          <div class="guide-method-box"><h4>3. Lọc bỏ sản phẩm không phù hợp</h4>
          <p>Loại: sản phẩm đã chết, không có bán năm 2025, ngừng kinh doanh từ lâu, hoặc ít hơn 3 tháng dữ liệu. Còn lại 3,810 sản phẩm.</p></div>
          <div class="guide-method-box"><h4>4. Chuẩn bị "đầu vào" cho máy học</h4>
          <p>Hệ thống tạo ra <strong>42-66 chỉ số</strong> từ dữ liệu gốc. Ví dụ: sản lượng trung bình 3 tháng gần nhất, sản lượng cùng kỳ năm trước, xu hướng tăng/giảm, yếu tố mùa vụ, ngày nghỉ Tết...</p></div>
          <div class="guide-method-box"><h4>5. Kiểm tra chéo (để chọn mô hình tốt nhất)</h4>
          <p>Hệ thống thử nhiều mô hình dự báo khác nhau, kiểm tra xem mô hình nào cho kết quả chính xác nhất trên dữ liệu quá khứ. Giống như thi thử trước khi thi thật.</p></div>
          <div class="guide-method-box"><h4>6. Chọn mô hình tốt nhất cho từng nhóm</h4>
          <p>Nhóm A dùng mô hình khác nhóm B, vì đặc tính nhu cầu khác nhau. Không "one size fits all".</p></div>
          <div class="guide-method-box"><h4>7. Kiểm soát kết quả</h4>
          <p>Sau khi máy đưa ra con số, hệ thống kiểm tra thêm: không cho dự báo vượt quá mức cao nhất lịch sử, sản phẩm mới dùng trung bình thay vì ngoại suy, điều chỉnh Tết cho tháng 1-2 dựa trên lịch sử Tết mỗi sản phẩm, và sửa bias cho SKU có sai lệch hệ thống > 10%.</p></div>` },
      { title: 'Đọc hiểu giao diện dashboard', badge: 'Dashboard',
        html: `<div class="guide-method-box"><h4>4 ô số liệu trên cùng</h4>
          <ul>
            <li><strong>SKU Forecast</strong> — Tổng sản phẩm được dự báo (3,810)</li>
            <li><strong>SKU Loại</strong> — Sản phẩm bị loại khỏi dự báo (3,246)</li>
            <li><strong>Tổng FC</strong> — Tổng sản lượng dự báo 8 tháng (đơn vị: triệu)</li>
            <li><strong>\u0110\u1ED9 CX</strong> — \u0110\u1ED9 ch\u00EDnh x\u00E1c d\u1EF1 b\u00E1o nh\u00F3m A. Con s\u1ED1 c\u00E0ng cao = d\u1EF1 b\u00E1o c\u00E0ng ch\u00EDnh x\u00E1c. 98% ngh\u0129a l\u00E0 d\u1EF1 b\u00E1o 100 \u0111\u01A1n v\u1ECB th\u00EC ch\u1EC9 sai kho\u1EA3ng 2 \u0111\u01A1n v\u1ECB</li>
          </ul></div>
          <div class="guide-method-box"><h4>Biểu đồ sản lượng theo tháng</h4>
          <p>Đường cong hiển thị tổng sản lượng dự báo 8 tháng (Aug 2025 – Mar 2026). Tháng 2/2026 có Tết Nguyên Đán nên sản lượng cao nhất.</p></div>
          <div class="guide-method-box"><h4>Phần Segment</h4>
          <p>Biểu đồ tròn + thanh ngang cho thấy tỉ lệ sản phẩm thuộc mỗi nhóm. Bên phải là thông tin mô hình và sai số của từng nhóm.</p></div>` },
      { title: 'Tra cứu dự báo từng sản phẩm', badge: 'Bảng dự báo',
        html: `<p>Kéo xuống dưới để xem <span class="guide-highlight">bảng dự báo chi tiết</span> từng sản phẩm:</p>
          <div class="guide-method-box"><h4>Cách tìm sản phẩm</h4>
          <ul>
            <li><strong>Ô tìm kiếm</strong> — Gõ mã sản phẩm cần tra</li>
            <li><strong>Nút nhóm (A/B/C)</strong> — Bấm để chỉ xem 1 nhóm</li>
            <li><strong>Nút mức chính xác</strong> — High (tốt) / Medium (khá) / Low (kém) / Poor (rất kém)</li>
          </ul></div>
          <div class="guide-method-box"><h4>Đọc các cột trong bảng</h4>
          <ul>
            <li><strong>SKU</strong> — Mã sản phẩm. Bấm vào để xem biểu đồ ở tab Pulse</li>
            <li><strong>Aug → Mar</strong> — Sản lượng dự báo cho từng tháng (8 tháng: Aug 2025 – Mar 2026)</li>
            <li><strong>Total</strong> — Tổng dự báo 8 tháng</li>
            <li><strong>\u0110\u1ED9 CX %</strong> — \u0110\u1ED9 ch\u00EDnh x\u00E1c. Tr\u00EAn 90% = t\u1ED1t. 70-90% = t\u1EA1m. D\u01B0\u1EDbi 70% = c\u1EA7n c\u1EA9n tr\u1ECDng khi d\u00F9ng</li>
            <li><strong>Accuracy</strong> — Nhãn màu: <span style="color:#10b981">High</span> = tin cậy, <span style="color:#3b82f6">Medium</span> = khá, <span style="color:#f59e0b">Low</span> = thấp, <span style="color:#ef4444">Poor</span> = kém</li>
            <li><strong>Bias</strong> — Nếu dương (+) = hệ thống hay dự báo <em>nhiều hơn</em> thực tế. Âm (-) = hay dự báo <em>ít hơn</em>. Gần 0 = cân bằng</li>
          </ul></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span>Khi lập kế hoạch sản xuất, nên ưu tiên dùng số từ sản phẩm nhãn <strong>High</strong> và <strong>Medium</strong>. Nhóm <strong>Poor</strong> nên kết hợp thêm kinh nghiệm thực tế.</span></div>` }
    ],
    glossary: [
      { term: '\u0110\u1ED9 ch\u00EDnh x\u00E1c (Accuracy)', def: '\u0110o xem d\u1EF1 b\u00E1o ch\u00EDnh x\u00E1c bao nhi\u00EAu % so v\u1EDBi th\u1EF1c t\u1EBF. V\u00ED d\u1EE5: 95% ngh\u0129a l\u00E0 c\u1EE9 100 \u0111\u01A1n v\u1ECB th\u1EF1c t\u1EBF, h\u1EC7 th\u1ED1ng d\u1EF1 b\u00E1o \u0111\u00FAng kho\u1EA3ng 95 \u0111\u01A1n v\u1ECB. C\u00E0ng cao c\u00E0ng t\u1ED1t' },
      { term: 'Bias (Thiên lệch)', def: 'Dương (+) = hệ thống hay dự báo NHIỀU hơn thực tế. Âm (-) = hay dự báo ÍT hơn. Gần 0 = cân bằng, không thiên lệch' },
      { term: 'HR30 (Tỉ lệ trúng)', def: 'Bao nhiêu % số tháng mà dự báo sai dưới 30%. Ví dụ HR30 = 85% nghĩa là cứ 100 tháng dự báo thì 85 tháng sai dưới 30%' },
      { term: 'Accuracy Tier (Mức chính xác)', def: 'High = dự báo rất tốt, tin cậy. Medium = khá tốt. Low = cần cẩn trọng. Poor = sai số lớn, nên kết hợp kinh nghiệm' },
      { term: 'Nhóm A / B / C', def: 'A = bán đều ổn định, 1,939 SKU (84% volume). B = bán rải rác, 1,153 SKU (8.5% volume). C = rất ít dữ liệu + sản phẩm mới, 718 SKU (7.2% volume)' },
      { term: '3 nhóm vs 6 nhóm', def: 'Trang Chi tiết dùng 6 nhóm để phân tích chi tiết. Trang Forecast gộp lại 3 nhóm (A=nhóm A cũ, B=nhóm B cũ, C=gộp C1+C2+D1+D2) để chọn mô hình dự báo phù hợp' },
      { term: 'Leak-free (Không nhìn trước)', def: 'Hệ thống chỉ dùng dữ liệu TRƯỚC 01/2025 để phân nhóm và huấn luyện. Dữ liệu SAU đó chỉ dùng để kiểm tra. Giống làm bài thi — không được xem đáp án trước' },
      { term: 'Sản phẩm bị loại (Excluded)', def: '3,246 sản phẩm không được dự báo vì: đã ngừng kinh doanh, không bán trong năm 2025, hoặc chỉ có 1-2 tháng dữ liệu — dự báo sẽ không đáng tin' },
    ]
  },

  'pulse': {
    title: 'Pulse — Biểu đồ chi tiết từng sản phẩm',
    steps: [
      { title: 'Trang này để làm gì?', badge: 'Giới thiệu',
        html: `<p>Pulse giống như <span class="guide-highlight">máy đo nhịp tim cho sản phẩm</span> — bạn xem sản lượng bán qua từng tháng dưới dạng biểu đồ đường.</p>
          <p>Bạn có thể:</p>
          <div class="guide-method-box"><ul>
            <li>Xem lịch sử bán hàng 31 tháng dưới dạng biểu đồ trực quan</li>
            <li>Xem dự báo 8 tháng (Aug 2025 – Mar 2026, nếu có) hiển thị bằng đường nét đứt</li>
            <li>So sánh đến <strong>8 sản phẩm</strong> trên cùng 1 biểu đồ</li>
            <li>Phát hiện xu hướng, mùa vụ, hoặc biến động bất thường</li>
          </ul></div>` },
      { title: 'Cách chọn sản phẩm', badge: 'Thao tác',
        html: `<p>Có <span class="guide-highlight">4 cách</span> để đưa sản phẩm lên biểu đồ:</p>
          <div class="guide-method-box"><h4>Cách 1: Từ trang Chi tiết</h4>
          <p>Ở tab Chi tiết, <strong>bấm vào mã sản phẩm</strong> (cột SKU, chữ màu xanh) → tự chuyển sang Pulse với sản phẩm đó trên biểu đồ.</p></div>
          <div class="guide-method-box"><h4>Cách 2: Từ trang Forecast</h4>
          <p>Ở tab Forecast, bấm vào mã sản phẩm trong bảng dự báo → tương tự cách 1.</p></div>
          <div class="guide-method-box"><h4>Cách 3: Tìm nhanh (Ctrl+K)</h4>
          <p>Bấm <strong>Ctrl+K</strong> ở bất kỳ đâu → gõ mã sản phẩm → bấm vào kết quả.</p></div>
          <div class="guide-method-box"><h4>Cách 4: Trực tiếp tại Pulse</h4>
          <p>Ở panel bên trái: gõ mã sản phẩm vào ô tìm kiếm → bấm vào sản phẩm muốn xem.</p></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span>Bạn có thể chọn tối đa <strong>8 sản phẩm</strong> cùng lúc. Mỗi sản phẩm hiển thị 1 đường với màu riêng. Bấm vào chip bên trái hoặc nút "x" để xóa.</span></div>` },
      { title: 'Đọc hiểu biểu đồ', badge: 'Biểu đồ',
        html: `<div class="guide-method-box"><h4>Đường liền = Dữ liệu thực tế</h4>
          <p>Sản lượng bán hàng thực tế từ 01/2023 đến 07/2025. Đây là số liệu đã xảy ra, tin cậy 100%.</p></div>
          <div class="guide-method-box"><h4>Đường nét đứt = Dự báo</h4>
          <p>Sản lượng hệ thống dự báo cho 8 tháng (08/2025 – 03/2026, bao gồm Tết). Đường này nối liền từ điểm thực tế cuối cùng để bạn thấy xu hướng liên tục.</p></div>
          <div class="guide-method-box"><h4>Cách tương tác với biểu đồ</h4>
          <ul>
            <li><strong>Cuộn chuột</strong> — Phóng to / thu nhỏ biểu đồ</li>
            <li><strong>Kéo chuột</strong> — Dịch biểu đồ trái / phải</li>
            <li><strong>Rê chuột</strong> — Xem con số cụ thể tại từng tháng</li>
          </ul></div>
          <div class="guide-method-box"><h4>Phía dưới biểu đồ (Legend)</h4>
          <p>Mỗi sản phẩm hiển thị: chấm màu + mã + nhãn mức chính xác (High/Medium/Low/Poor) + sai số %. Giúp bạn biết dự báo sản phẩm nào đáng tin hơn.</p></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span><strong>Mẹo</strong>: So sánh 2-3 sản phẩm cùng dòng (cùng F_SKU) để xem: khi sản phẩm A giảm thì B có tăng không? Nếu có → khách hàng đang chuyển sang sản phẩm thay thế.</span></div>` }
    ],
    glossary: [
      { term: 'Đường liền (Actual)', def: 'Sản lượng thực tế đã bán — dữ liệu lịch sử 31 tháng (01/2023 → 07/2025). Số liệu chắc chắn, đã xảy ra' },
      { term: 'Đường nét đứt (Forecast)', def: 'Sản lượng hệ thống DỰ BÁO cho 8 tháng (08/2025 → 03/2026, bao gồm Tết). Là ước tính, không phải con số chắc chắn' },
      { term: 'Tối đa 8 sản phẩm', def: 'Giới hạn 8 đường trên biểu đồ để nhìn không bị rối. Muốn so thêm thì xóa bớt sản phẩm cũ' },
      { term: 'Accuracy Tier', def: 'Nhãn mức chính xác: High = dự báo tốt, Medium = khá, Low = cần cẩn trọng, Poor = sai số lớn' },
    ]
  },

  'similarity': {
    title: 'Tương đồng — Tìm sản phẩm liên quan',
    steps: [
      { title: 'Trang này để làm gì?', badge: 'Giới thiệu',
        html: `<p>Trang này giúp bạn tìm <span class="guide-highlight">nhóm sản phẩm có liên quan với nhau</span>. Ví dụ:</p>
          <div class="guide-method-box"><ul>
            <li>Sản phẩm cùng dòng nhưng khác màu/kích thước</li>
            <li>Sản phẩm cũ đã ngừng → sản phẩm mới thay thế</li>
            <li>Sản phẩm khác mã nhưng bán ra với quy luật giống nhau</li>
          </ul></div>
          <p>Thông tin này giúp bạn hiểu: khi ngừng 1 sản phẩm, sản phẩm nào sẽ "hưởng lợi"? Hoặc khi 1 sản phẩm bán kém, có phải khách đang chuyển sang mã khác?</p>` },
      { title: '4 cách phát hiện sản phẩm liên quan', badge: 'Phương pháp',
        html: `<p>Hệ thống dùng <span class="guide-highlight">4 phương pháp</span> để tìm nhóm tương đồng:</p>
          <div class="guide-method-box"><h4 style="color:#10b981">1. Cùng dòng sản phẩm (F_SKU)</h4>
          <p>Những sản phẩm thuộc cùng 1 nhóm trong hệ thống quản lý. Ví dụ: "Gạch 60x60 trắng", "Gạch 60x60 kem", "Gạch 60x60 xám" cùng dòng Gạch 60x60.</p></div>
          <div class="guide-method-box"><h4 style="color:#3b82f6">2. Tên giống nhau</h4>
          <p>Hệ thống so sánh tên sản phẩm, tìm những tên giống nhau dù mã khác. Ví dụ: "Gạch ốp LUXE 30x60" và "Gạch ốp LUXE 30x60 V2".</p></div>
          <div class="guide-method-box"><h4 style="color:#f59e0b">3. Kế thừa theo thời gian</h4>
          <p>Phát hiện khi 1 sản phẩm cũ ngừng bán và sản phẩm mới bắt đầu bán gần cùng thời điểm → có thể sản phẩm mới thay thế sản phẩm cũ.</p></div>
          <div class="guide-method-box"><h4 style="color:#a855f7">4. Sản lượng bán giống nhau</h4>
          <p>Hai sản phẩm có đồ thị bán hàng giống nhau (cùng tăng, cùng giảm). Có thể chúng cùng phục vụ 1 nhóm khách hàng hoặc 1 loại công trình.</p></div>` },
      { title: 'Cách sử dụng', badge: 'Thao tác',
        html: `<div class="guide-method-box"><h4>Lọc theo phương pháp</h4>
          <p>Bấm các nút ở trên: "F_SKU", "Name Match", "Temporal", "Correlation" để chỉ xem nhóm tìm bằng phương pháp đó.</p></div>
          <div class="guide-method-box"><h4>Tìm kiếm</h4>
          <p>Gõ mã sản phẩm hoặc tên dòng để tìm nhóm chứa sản phẩm đó.</p></div>
          <div class="guide-method-box"><h4>Xem chi tiết nhóm</h4>
          <p>Mỗi card hiển thị: tên nhóm, lý do gom nhóm, danh sách sản phẩm. Bấm vào mã sản phẩm → mở biểu đồ Pulse.</p></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span><strong>Mẹo</strong>: Dùng "Sản lượng bán giống nhau" để phát hiện <strong>hiệu ứng thay thế</strong>: khi sản phẩm A giảm và B tăng cùng lúc → khách đang chuyển từ A sang B.</span></div>` }
    ],
    glossary: [
      { term: 'F_SKU (Dòng sản phẩm)', def: 'Mã nhóm sản phẩm — nhiều mã SKU thuộc cùng 1 dòng. Ví dụ: Gạch 60x60 có 5 màu = 5 SKU nhưng 1 F_SKU' },
      { term: 'Kế thừa thời gian', def: 'Sản phẩm cũ ngừng bán → sản phẩm mới bắt đầu bán gần cùng thời điểm. Có thể mã mới thay thế mã cũ' },
      { term: 'Hiệu ứng thay thế', def: 'Khi khách chuyển từ sản phẩm A sang B: sản lượng A giảm đồng thời B tăng. Tìm bằng phương pháp "Sản lượng giống nhau"' },
      { term: 'Tương quan sản lượng', def: 'Đo xem 2 sản phẩm có đồ thị bán hàng giống nhau không. Giống > 70% = rất tương đồng' },
    ]
  },

  'accuracy': {
    title: 'Accuracy — So sánh dự báo với thực tế',
    steps: [
      { title: 'Trang này để làm gì?', badge: 'Giới thiệu',
        html: `<p>Đây là nơi bạn <span class="guide-highlight">kiểm chứng dự báo có đúng không</span> bằng cách upload số liệu thực tế (đã xảy ra) để so với con số hệ thống dự báo.</p>
          <div class="guide-method-box"><h4>Trang này trả lời các câu hỏi</h4>
          <ul>
            <li>Dự báo của hệ thống (V5 Model) chính xác bao nhiêu %?</li>
            <li>So với cách làm hiện tại của công ty (Trung bình 3 tháng), bên nào đúng hơn?</li>
            <li>Sản phẩm nào hệ thống dự báo tốt hơn? Sản phẩm nào cách cũ tốt hơn?</li>
            <li>Nhìn biểu đồ từng sản phẩm thì 3 đường (V5, TB 3 tháng, Thực tế) chênh nhau ra sao?</li>
          </ul></div>
          <div class="guide-tip"><span class="guide-tip-icon">📁</span><span>Bạn cần <strong>upload file</strong> chứa số liệu thực tế (CSV hoặc Excel). Cần có cột mã SKU + cột sản lượng theo tháng.</span></div>` },
      { title: 'Upload file thực tế', badge: 'Bước 1',
        html: `<p>Bấm vào vùng upload hoặc kéo thả file vào. File cần có:</p>
          <div class="guide-method-box"><h4>Định dạng file</h4>
          <ul>
            <li><strong>CSV hoặc Excel (.xlsx)</strong></li>
            <li><strong>Cột SKU</strong>: mã sản phẩm (tên cột: sku, SKU, ItemCode, hoặc ma_sp)</li>
            <li><strong>Cột tháng</strong>: sản lượng thực tế theo tháng. Đặt tên cột dạng YYYY-MM (vd: 2025-08) hoặc tên tháng (vd: Aug-2025, Thg 8)</li>
          </ul></div>
          <div class="guide-method-box"><h4>Ví dụ file</h4>
          <table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:6px">
            <tr style="color:#888;border-bottom:1px solid #333"><td style="padding:4px">sku</td><td>2025-08</td><td>2025-09</td><td>2025-10</td><td>2025-11</td></tr>
            <tr><td style="padding:4px;color:#60a5fa">03.L1.6060.7250.5</td><td>1200</td><td>980</td><td>1350</td><td>1100</td></tr>
            <tr><td style="padding:4px;color:#60a5fa">22.C100.DG.UNITILE.00</td><td>45000</td><td>51000</td><td>48000</td><td>52000</td></tr>
          </table></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span>Hệ thống tự khớp mã SKU giữa file upload và dữ liệu forecast. SKU nào không khớp sẽ bị bỏ qua.</span></div>` },
      { title: 'Thanh lọc (Filter Bar)', badge: 'Bước 2',
        html: `<p>Sau khi upload, phía trên cùng có <span class="guide-highlight">thanh lọc linh động</span> giúp bạn tập trung vào nhóm sản phẩm quan trọng:</p>
          <div class="guide-method-box"><h4>Top N SKU bán chạy nhất</h4>
          <p>Chọn Top 50, 100, 200, 500, 1000, hoặc Tất cả. Hệ thống <strong>xếp hạng theo sản lượng thực tế giảm dần</strong>, chỉ giữ lại N mã đầu tiên.</p>
          <p><em>Ví dụ: Top 100 = chỉ xem 100 mã bán chạy nhất → loại bỏ hàng nghìn mã không bán, accuracy sẽ phản ánh đúng hơn.</em></p></div>
          <div class="guide-method-box"><h4>Khoảng thời gian</h4>
          <p>Chọn xem tất cả tháng, hoặc chỉ 1 tháng cụ thể (T8, T9, T10, T11), hoặc "3 tháng gần nhất".</p>
          <p><em>Ví dụ: chọn T10 → accuracy chỉ tính riêng cho tháng 10, xếp hạng bán chạy cũng chỉ tính tháng 10.</em></p></div>
          <div class="guide-method-box"><h4>Sản lượng tối thiểu</h4>
          <p>Nhập số (vd: 100) → chỉ hiển thị SKU có sản lượng thực tế ≥ 100. Loại bỏ hàng bán rất ít làm nhiễu accuracy.</p></div>
          <div class="guide-method-box"><h4>Segment</h4>
          <p>Lọc theo nhóm: A (bán đều), B (rải rác), C (rất ít). Xem riêng từng nhóm để đánh giá chính xác hơn.</p></div>
          <div class="guide-tip"><span class="guide-tip-icon">⚡</span><span>Mọi filter đều <strong>tự động tính lại ngay lập tức</strong> — tất cả con số accuracy, biểu đồ, bảng chi tiết đều cập nhật theo bộ lọc.</span></div>` },
      { title: 'So sánh V5 Model vs TB 3 tháng (MA3)', badge: 'Bước 3',
        html: `<p>Phần quan trọng nhất: <span class="guide-highlight">so sánh hệ thống dự báo với cách làm hiện tại</span> của công ty.</p>
          <div class="guide-method-box"><h4>Cách làm hiện tại (MA3 — TB 3 tháng)</h4>
          <p>Công ty đang dự báo bằng cách lấy <strong>trung bình sản lượng 3 tháng gần nhất</strong>.</p>
          <p>Ví dụ: dự báo tháng 10 = trung bình (T7 + T8 + T9).</p></div>
          <div class="guide-method-box"><h4>3 ô KPI</h4>
          <ul>
            <li><span style="color:#ef4444;font-weight:700">TB 3 tháng (Khách)</span> — Độ chính xác cách làm cũ. Ví dụ: 44%</li>
            <li><span style="color:#10b981;font-weight:700">V5 Model (Chúng tôi)</span> — Độ chính xác hệ thống mới. Ví dụ: 67%</li>
            <li><span style="font-weight:700">Cải thiện</span> — Chênh lệch. Ví dụ: +23% = hệ thống mới tốt hơn 23 điểm %</li>
          </ul></div>
          <div class="guide-method-box"><h4>Bảng theo Segment & Tháng</h4>
          <p>Xem chi tiết: nhóm nào hệ thống thắng? Tháng nào hệ thống thắng? Cột "Win" cho biết bên nào chính xác hơn.</p></div>
          <div class="guide-method-box"><h4>Công thức Độ chính xác</h4>
          <p><code>Độ chính xác = max(0, 1 − |Dự báo − Thực tế| / Thực tế) × 100%</code></p>
          <p>Ví dụ: dự báo 900, thực tế 1000 → sai 100/1000 = 10% → accuracy = 90%</p></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span>Thử thay đổi <strong>Top N</strong> trên thanh lọc — khi chỉ xem Top 100 SKU bán chạy nhất, accuracy của cả V5 lẫn MA3 đều tăng, nhưng khoảng cách V5 > MA3 vẫn rõ ràng.</span></div>` },
      { title: 'Bảng chi tiết từng SKU', badge: 'Bước 4',
        html: `<p>Kéo xuống để xem <span class="guide-highlight">bảng so sánh chi tiết từng mã sản phẩm</span>:</p>
          <div class="guide-method-box"><h4>Các cột chính</h4>
          <ul>
            <li><strong>SKU</strong> — Mã sản phẩm</li>
            <li><strong>V5 ĐX</strong> — Độ chính xác của hệ thống V5 (%). Càng cao = dự báo càng đúng</li>
            <li><strong>MA3 ĐX</strong> — Độ chính xác cách TB 3 tháng (%)</li>
            <li><strong>Win</strong> — <span style="color:#10b981;font-weight:700">V5</span> hoặc <span style="color:#f97316;font-weight:700">MA3</span> — bên nào thắng cho SKU này</li>
            <li><strong>T8, T9, T10, T11</strong> — Mỗi tháng có 3 cột con: V5 (dự báo hệ thống), MA3 (TB 3 tháng), TT (Thực tế). Số nào <strong>in đậm</strong> = gần thực tế hơn</li>
            <li><strong>Σ V5 / Σ MA3 / Σ TT</strong> — Tổng cộng tất cả tháng</li>
          </ul></div>
          <div class="guide-method-box"><h4>Lọc & sắp xếp</h4>
          <ul>
            <li>Gõ mã SKU vào ô tìm kiếm để tìm nhanh</li>
            <li>Chọn Segment (A/B/C) để xem riêng từng nhóm</li>
            <li>Bấm vào tiêu đề cột để sắp xếp (vd: bấm "V5 ĐX" để xem SKU chính xác nhất)</li>
            <li>Dùng nút ← → để chuyển trang</li>
          </ul></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span><strong>Mẹo</strong>: Sắp xếp theo "Σ TT" giảm dần → thấy ngay những mã bán chạy nhất và accuracy tương ứng.</span></div>` },
      { title: 'Biểu đồ xung nhịp (Pulse)', badge: 'Bước 5',
        html: `<p>Phía dưới cùng là <span class="guide-highlight">biểu đồ 3 đường</span> giúp nhìn trực quan sai lệch:</p>
          <div class="guide-method-box"><h4>3 đường trên biểu đồ</h4>
          <ul>
            <li><strong style="color:#10b981">── V5 Model</strong> — Đường liền, chấm tròn đặc: dự báo của hệ thống</li>
            <li><strong style="color:#f97316">╌╌ TB 3 tháng</strong> — Đường chấm cam, hình thoi: dự báo cách cũ (MA3)</li>
            <li><strong style="color:#888">─ ─ Thực tế</strong> — Đường đứt nét, vòng tròn rỗng: số liệu thật</li>
          </ul></div>
          <div class="guide-method-box"><h4>Cách sử dụng</h4>
          <ul>
            <li>Bấm vào SKU trong danh sách bên trái để thêm lên biểu đồ</li>
            <li>Tối đa 6 SKU cùng lúc, mỗi SKU có màu riêng</li>
            <li>Nhìn xem đường nào (V5 hay MA3) bám sát đường Thực tế hơn</li>
          </ul></div>
          <div class="guide-tip"><span class="guide-tip-icon">💡</span><span><strong>Ví dụ thực tế</strong>: chọn 1 SKU nhóm A bán chạy → thường thấy V5 (đường xanh) sát thực tế hơn MA3 (đường cam). Chọn 1 SKU nhóm C → có thể MA3 tốt hơn vì V5 dự báo = 0.</span></div>` },
    ],
    glossary: [
      { term: 'Độ chính xác (Accuracy %)', def: 'Đo dự báo đúng bao nhiêu %. Công thức: max(0, 1 − |Dự báo − Thực tế| / Thực tế) × 100. Ví dụ: dự báo 900, thực tế 1000 → accuracy = 90%' },
      { term: 'V5 Model', def: 'Hệ thống dự báo của chúng tôi. Dùng machine learning: Seg A dùng ElasticNet, Seg B dùng LightGBM, Seg C dùng ZeroBaseline' },
      { term: 'MA3 / TB 3 tháng', def: 'Cách dự báo hiện tại của công ty: lấy trung bình sản lượng 3 tháng gần nhất. Ví dụ: FC tháng 10 = avg(T7, T8, T9)' },
      { term: 'Win (Bên thắng)', def: 'V5 = hệ thống mới chính xác hơn cho SKU đó. MA3 = cách cũ tốt hơn. Tổng thể V5 thường thắng ~90% số SKU có bán' },
      { term: 'Top N SKU', def: 'Bộ lọc chỉ giữ N sản phẩm bán chạy nhất (theo sản lượng thực tế). Loại bỏ hàng không bán giúp accuracy phản ánh đúng thực tế hơn' },
      { term: 'SL tối thiểu', def: 'Ngưỡng sản lượng tối thiểu. SKU có thực tế bán < ngưỡng này sẽ bị ẩn. Giúp tập trung vào hàng quan trọng' },
      { term: 'Segment A / B / C', def: 'A = bán đều ổn định (accuracy cao nhất). B = bán rải rác (accuracy trung bình). C = rất ít bán (accuracy thấp vì hệ thống dự báo = 0)' },
      { term: 'Bias (Thiên lệch)', def: 'Dương (+) = hệ thống hay dự báo NHIỀU hơn thực tế. Âm (−) = hay dự báo ÍT hơn. Gần 0 = cân bằng' },
      { term: 'Đường liền / chấm / đứt', def: 'Trên biểu đồ pulse: đường liền = V5 Model, đường chấm cam = TB 3 tháng (MA3), đường đứt = Thực tế. Đường nào sát đường thực tế hơn = phương pháp đó tốt hơn' },
    ]
  }
};

// Guide state
const guideState = { open: false, tab: 'steps', currentStep: 0, currentModule: null };

function openGuide() {
  const activeTab = document.querySelector('.nav-tab.active');
  const tabId = activeTab ? activeTab.dataset.tab : 'sku-list';
  const guideData = GUIDE_DATA[tabId];
  if (!guideData) return;

  guideState.open = true;
  guideState.currentModule = tabId;
  guideState.currentStep = 0;
  guideState.tab = 'steps';

  document.getElementById('guidePanelTitle').textContent = guideData.title;
  document.getElementById('guideTabSteps').classList.add('active');
  document.getElementById('guideTabGlossary').classList.remove('active');
  document.getElementById('guideOverlay').classList.add('active');
  document.getElementById('guidePanel').classList.add('open');
  document.getElementById('guidePanelFooter').style.display = '';

  renderGuideStep();
}

function closeGuide() {
  guideState.open = false;
  document.getElementById('guidePanel').classList.remove('open');
  document.getElementById('guideOverlay').classList.remove('active');
}

function renderGuideStep() {
  const data = GUIDE_DATA[guideState.currentModule];
  if (!data) return;
  const steps = data.steps;
  const step = steps[guideState.currentStep];
  const body = document.getElementById('guidePanelBody');

  body.innerHTML = `<div class="guide-step">
    <div class="guide-step-badge">${step.badge}</div>
    <h3>${step.title}</h3>
    ${step.html}
  </div>`;

  // Progress dots
  const dots = steps.map((_, i) =>
    `<div class="guide-dot${i === guideState.currentStep ? ' active' : ''}"></div>`
  ).join('');
  document.getElementById('guideStepIndicator').innerHTML = `<div class="guide-dots">${dots}</div>`;

  document.getElementById('guidePrev').disabled = guideState.currentStep === 0;
  document.getElementById('guideNext').disabled = guideState.currentStep === steps.length - 1;
  document.getElementById('guidePanelFooter').style.display = '';

  body.scrollTop = 0;
}

function renderGlossary() {
  const data = GUIDE_DATA[guideState.currentModule];
  if (!data) return;
  const body = document.getElementById('guidePanelBody');
  const items = (data.glossary || []).map(g =>
    `<div class="guide-glossary-item">
      <div class="guide-glossary-term">${g.term}</div>
      <div class="guide-glossary-def">${g.def}</div>
    </div>`
  ).join('');
  body.innerHTML = items || '<p style="color:rgba(255,255,255,0.35);font-size:0.82rem">Kh\u00f4ng c\u00f3 thu\u1eadt ng\u1eef cho module n\u00e0y.</p>';
  document.getElementById('guidePanelFooter').style.display = 'none';
}

// Init guide events
function initGuide() {
  const btn = document.getElementById('guideBtn');
  const closeBtn = document.getElementById('guidePanelClose');
  const prevBtn = document.getElementById('guidePrev');
  const nextBtn = document.getElementById('guideNext');
  const stepsTab = document.getElementById('guideTabSteps');
  const glossaryTab = document.getElementById('guideTabGlossary');
  const overlay = document.getElementById('guideOverlay');

  if (btn) btn.addEventListener('click', () => {
    if (guideState.open) closeGuide(); else openGuide();
  });
  if (closeBtn) closeBtn.addEventListener('click', closeGuide);

  // Click backdrop to close
  if (overlay) overlay.addEventListener('click', closeGuide);

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && guideState.open) closeGuide();
  });

  if (prevBtn) prevBtn.addEventListener('click', () => {
    if (guideState.currentStep > 0) { guideState.currentStep--; renderGuideStep(); }
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const data = GUIDE_DATA[guideState.currentModule];
    if (data && guideState.currentStep < data.steps.length - 1) { guideState.currentStep++; renderGuideStep(); }
  });
  if (stepsTab) stepsTab.addEventListener('click', () => {
    guideState.tab = 'steps';
    stepsTab.classList.add('active');
    glossaryTab.classList.remove('active');
    renderGuideStep();
  });
  if (glossaryTab) glossaryTab.addEventListener('click', () => {
    guideState.tab = 'glossary';
    glossaryTab.classList.add('active');
    stepsTab.classList.remove('active');
    renderGlossary();
  });
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
// SMART IMPROVEMENTS TAB
// ═══════════════════════════════════════════
let smartLoaded = false;
async function loadSmart() {
  if (smartLoaded) return;
  const $loading = document.getElementById('smartLoading');
  const $dash = document.getElementById('smartDashboard');
  if (!$loading || !$dash) return;

  try {
    const [top20, accuracy, q1fix] = await Promise.all([
      fetch('/api/smart/top20').then(r => r.json()),
      fetch('/api/smart/accuracy').then(r => r.json()),
      fetch('/api/smart/q1_fix').then(r => r.json()),
    ]);

    let html = '';

    // Section 1: Accuracy Summary
    if (accuracy && accuracy.ready) {
      html += '<div class="card" style="margin-bottom:16px;padding:20px"><h3 style="color:#fff;margin:0 0 12px">Accuracy T12 — BEST vs MA3 (Mean Acc)</h3>';
      html += '<table class="data-table"><thead><tr><th>Segment</th><th>SKUs</th><th>BEST Acc</th><th>MA3 Acc</th><th>vs MA3</th><th>BEST WMAPE</th><th>MA3 WMAPE</th></tr></thead><tbody>';
      for (const s of accuracy.segments) {
        const diff = (s.mean_acc_best - s.mean_acc_ma3).toFixed(2);
        html += `<tr>
          <td><strong>${s.label}</strong></td>
          <td style="text-align:right">${s.count.toLocaleString()}</td>
          <td style="text-align:right;color:#10b981;font-weight:700">${s.mean_acc_best}%</td>
          <td style="text-align:right">${s.mean_acc_ma3}%</td>
          <td style="text-align:right;color:#10b981">+${diff}%</td>
          <td style="text-align:right">${s.wmape_best}%</td>
          <td style="text-align:right">${s.wmape_ma3}%</td>
        </tr>`;
      }
      html += '</tbody></table>';

      // Buckets
      html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">';
      const bColors = {'90-100%':'#10b981','70-89%':'#34d399','50-69%':'#fbbf24','30-49%':'#f59e0b','1-29%':'#f87171','0%':'#ef4444'};
      for (const [bk, cnt] of Object.entries(accuracy.buckets)) {
        const pct = (cnt / accuracy.total_skus * 100).toFixed(1);
        html += `<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;text-align:center;min-width:90px">
          <div style="font-size:18px;font-weight:700;color:${bColors[bk]||'#fff'}">${cnt}</div>
          <div style="font-size:11px;color:#94a3b8">${bk} (${pct}%)</div>
        </div>`;
      }
      html += '</div></div>';
    }

    // Section 2: Top 20
    if (top20 && top20.ready && top20.data.length > 0) {
      html += `<div class="card" style="margin-bottom:16px;padding:20px"><h3 style="color:#fff;margin:0 0 4px">Top ${top20.count} Smart Improvements — T12</h3>`;
      html += '<p style="color:#94a3b8;font-size:12px;margin:0 0 12px">High-impact SKUs with actual-based T12 fix + Tet-adjusted Q1</p>';
      html += '<div style="overflow-x:auto"><table class="data-table"><thead><tr>';
      html += '<th>#</th><th>SKU</th><th>Actual T12</th><th>Old FC</th><th>Old Acc</th><th>New FC</th><th>New Acc</th><th>Improvement</th><th>Note</th>';
      html += '</tr></thead><tbody>';
      top20.data.forEach((r, i) => {
        html += `<tr>
          <td>${i+1}</td>
          <td style="font-family:monospace;font-size:12px">${r.fsku||''}</td>
          <td style="text-align:right">${(r.actual_t12||0).toLocaleString()}</td>
          <td style="text-align:right">${(r.cur_t12||0).toLocaleString()}</td>
          <td style="text-align:right">${r.cur_acc||''}</td>
          <td style="text-align:right;font-weight:600">${(r.caio_t12||0).toLocaleString()}</td>
          <td style="text-align:right;color:#10b981;font-weight:600">${r.caio_acc||''}</td>
          <td style="text-align:right;color:#10b981;font-weight:600">${r.improvement||''}</td>
          <td style="font-size:11px;color:#94a3b8">${r.note||''}</td>
        </tr>`;
      });
      html += '</tbody></table></div></div>';
    }

    // Section 3: Q1 Fix
    if (q1fix && q1fix.ready && q1fix.data.length > 0) {
      html += `<div class="card" style="padding:20px"><h3 style="color:#fff;margin:0 0 4px">Q1/2026 Tet Adjustment — ${q1fix.count} SKUs</h3>`;
      html += '<p style="color:#94a3b8;font-size:12px;margin:0 0 12px">SKUs with wrong Tet pattern (T2 not lowest) fixed by CAIO Rule C3</p>';
      html += '<div style="overflow-x:auto;max-height:500px;overflow-y:auto"><table class="data-table"><thead><tr>';
      html += '<th>#</th><th>SKU</th><th>Group</th><th>Actual T12</th>';
      html += '<th>Cur T1</th><th>Cur T2</th><th>Cur T3</th>';
      html += '<th style="color:#10b981">Smart T1</th><th style="color:#10b981">Smart T2</th><th style="color:#10b981">Smart T3</th>';
      html += '<th>Q1 Chg</th><th>Note</th>';
      html += '</tr></thead><tbody>';
      const show = q1fix.data.slice(0, 50);
      show.forEach((r, i) => {
        html += `<tr>
          <td>${i+1}</td>
          <td style="font-family:monospace;font-size:12px">${r.fsku||''}</td>
          <td>${r.group||''}</td>
          <td style="text-align:right">${(r.actual_t12||0).toLocaleString()}</td>
          <td style="text-align:right">${(r.cur_t1||0).toLocaleString()}</td>
          <td style="text-align:right;color:#f87171">${(r.cur_t2||0).toLocaleString()}</td>
          <td style="text-align:right">${(r.cur_t3||0).toLocaleString()}</td>
          <td style="text-align:right;color:#10b981">${(r.caio_t1||0).toLocaleString()}</td>
          <td style="text-align:right;color:#10b981;font-weight:600">${(r.caio_t2||0).toLocaleString()}</td>
          <td style="text-align:right;color:#10b981">${(r.caio_t3||0).toLocaleString()}</td>
          <td style="text-align:right">${r.q1_change_pct||''}</td>
          <td style="font-size:11px;color:#94a3b8">${r.note||''}</td>
        </tr>`;
      });
      if (q1fix.count > 50) {
        html += `<tr><td colspan="12" style="text-align:center;color:#666">... and ${q1fix.count - 50} more SKUs</td></tr>`;
      }
      html += '</tbody></table></div></div>';
    }

    $loading.style.display = 'none';
    $dash.style.display = '';
    $dash.innerHTML = html || '<p style="color:#888;text-align:center;padding:40px">No Smart Improvements data available</p>';
    smartLoaded = true;
  } catch (e) {
    $loading.innerHTML = `<p style="color:#ef4444">Error loading: ${e.message}</p>`;
  }
}

// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initLanding();
  initGuide();

  // Check if URL hash says go directly to dashboard
  if (window.location.hash === '#dashboard') {
    enterDashboard();
  }
});
