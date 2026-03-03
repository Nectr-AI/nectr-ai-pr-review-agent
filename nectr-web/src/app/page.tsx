import Link from 'next/link';
import {
  GitPullRequest, BarChart3, Brain, Zap, Shield, Users,
  Check, ArrowRight, Github, Clock, TrendingUp,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://devkit-production.up.railway.app';

const FEATURES = [
  {
    icon: GitPullRequest,
    title: 'Smart Code Review',
    desc: 'AI reviews every PR in seconds — inline suggestions, verdict, and confidence score. No bot noise, only real actionable feedback.',
  },
  {
    icon: BarChart3,
    title: 'Team Analytics',
    desc: 'Merge times, author breakdowns, issue frequency, verdict distribution. Know where your team is thriving and where it\'s stuck.',
  },
  {
    icon: Brain,
    title: 'Project Memory',
    desc: 'Nectr learns your codebase over time. Project rules, dev patterns, architecture decisions — all applied to every new review.',
  },
  {
    icon: Zap,
    title: 'Zero Config',
    desc: 'Sign in with GitHub, connect a repo, and Nectr starts reviewing in minutes. No YAML, no config files, no DSL to learn.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    desc: 'httpOnly JWT cookies, encrypted GitHub tokens, per-repo webhook secrets. Built for teams that take security seriously.',
  },
  {
    icon: Users,
    title: 'Developer Profiles',
    desc: 'AI-built profiles for every contributor — strengths, recurring patterns, preferred areas. Give better code review feedback.',
  },
];

const STEPS = [
  { step: '01', title: 'Sign in with GitHub', desc: 'OAuth in one click. No password, no email setup. Just connect your GitHub account.' },
  { step: '02', title: 'Connect a Repo', desc: 'Pick any repo you have access to. Nectr installs a webhook and scans the codebase automatically.' },
  { step: '03', title: 'Get AI Reviews', desc: 'Every new PR gets reviewed instantly. AI posts inline suggestions, verdict, and a confidence score.' },
];

const FREE_FEATURES = [
  'Unlimited PR reviews',
  'Up to 3 repos',
  '1 team',
  'Basic analytics',
  'Project memory',
  'GitHub OAuth',
];

const PRO_FEATURES = [
  'Everything in Free',
  'Unlimited repos & teams',
  'Advanced analytics',
  'API access',
  'Priority processing',
  'Developer profiles',
  'Confidence threshold tuning',
  'Priority support',
];

export default function LandingPage() {
  return (
    <>
      {/* Global landing page styles */}
      <style>{`
        .lp-body { min-height: 100vh; background: #111111; color: #f5f5f5; font-family: var(--font-dm-sans, 'DM Sans', sans-serif); }
        .lp-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 50; border-bottom: 1px solid #1c1c1c; background: rgba(17,17,17,0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .lp-nav-inner { max-width: 1120px; margin: 0 auto; padding: 0 20px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
        .lp-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .lp-logo-wrap { display: flex; align-items: center; gap: 10px; }
        .lp-logo-tile { position: relative; width: 36px; height: 36px; background: #fff; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .lp-logo-dot { position: absolute; top: -5px; right: -5px; width: 11px; height: 11px; background: #F5C000; border-radius: 50%; border: 2.5px solid #111111; }
        .lp-wordmark { font-weight: 900; font-size: 26px; letter-spacing: -0.03em; line-height: 1; color: #fff; }
        .lp-wordmark-acc { color: #F5C000; }
        .lp-nav-links { display: flex; align-items: center; gap: 32px; }
        .lp-nav-link { font-size: 14px; color: #888888; text-decoration: none; font-weight: 500; transition: color 150ms; }
        .lp-nav-link:hover { color: #f5f5f5; }
        .lp-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: #F5C000; color: #111111; font-weight: 700; font-size: 14px; padding: 10px 20px; border-radius: 8px; text-decoration: none; letter-spacing: -0.01em; box-shadow: 0 0 20px rgba(245,192,0,0.2); transition: background-color 150ms, box-shadow 150ms; }
        .lp-btn-primary:hover { background: #C49800; box-shadow: 0 0 28px rgba(245,192,0,0.3); }
        .lp-btn-primary-lg { display: inline-flex; align-items: center; gap: 8px; background: #F5C000; color: #111111; font-weight: 900; font-size: 16px; padding: 16px 32px; border-radius: 10px; text-decoration: none; box-shadow: 0 0 32px rgba(245,192,0,0.25); transition: background-color 150ms; }
        .lp-btn-primary-lg:hover { background: #C49800; }
        .lp-btn-primary-xl { display: inline-flex; align-items: center; gap: 12px; background: #F5C000; color: #111111; font-weight: 900; font-size: 18px; padding: 20px 40px; border-radius: 12px; text-decoration: none; box-shadow: 0 0 40px rgba(245,192,0,0.25); transition: background-color 150ms; }
        .lp-btn-primary-xl:hover { background: #C49800; }
        .lp-btn-secondary { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: #f5f5f5; font-weight: 700; font-size: 16px; padding: 15px 32px; border-radius: 10px; border: 1.5px solid #2a2a2a; text-decoration: none; transition: border-color 150ms, color 150ms; }
        .lp-btn-secondary:hover { border-color: rgba(245,192,0,0.3); color: #F5C000; }
        .lp-hero { position: relative; padding: 128px 20px 96px; overflow: hidden; }
        .lp-grid-bg { position: absolute; inset: 0; background-image: linear-gradient(rgba(245,192,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(245,192,0,0.03) 1px, transparent 1px); background-size: 40px 40px; pointer-events: none; }
        .lp-glow { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 600px; height: 400px; background: radial-gradient(ellipse, rgba(245,192,0,0.07) 0%, transparent 70%); pointer-events: none; }
        .lp-hero-inner { position: relative; max-width: 800px; margin: 0 auto; text-align: center; }
        .lp-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 9999px; background: rgba(245,192,0,0.1); border: 1px solid rgba(245,192,0,0.2); margin-bottom: 32px; }
        .lp-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #F5C000; }
        .lp-badge-text { color: #F5C000; font-size: 11px; font-family: var(--font-geist-mono, 'Geist Mono', monospace); letter-spacing: 0.3em; text-transform: uppercase; }
        .lp-h1 { font-weight: 900; font-size: clamp(2.5rem, 6vw, 3.75rem); letter-spacing: -0.04em; line-height: 1; margin-bottom: 24px; color: #f5f5f5; }
        .lp-gradient-text { background: linear-gradient(135deg, #F5C000 0%, #C49800 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .lp-sub { font-size: 16px; color: #888888; max-width: 580px; margin: 0 auto 40px; line-height: 1.65; }
        .lp-ctas { display: flex; flex-direction: row; flex-wrap: wrap; gap: 16px; justify-content: center; }
        .lp-hint { color: #444444; font-size: 13px; margin-top: 24px; font-family: var(--font-geist-mono, monospace); }
        .lp-strip { border-top: 1px solid #1c1c1c; border-bottom: 1px solid #1c1c1c; background: #1a1a1a; padding: 20px; }
        .lp-strip-inner { max-width: 960px; margin: 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 32px; }
        .lp-strip-item { display: flex; align-items: center; gap: 8px; color: #888888; font-size: 13px; font-family: var(--font-geist-mono, monospace); }
        .lp-features { padding: 96px 20px; }
        .lp-features-inner { max-width: 1120px; margin: 0 auto; }
        .lp-section-head { text-align: center; margin-bottom: 64px; }
        .lp-eyebrow { display: block; margin-bottom: 12px; font-family: var(--font-geist-mono, monospace); font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #444444; }
        .lp-h2 { font-weight: 900; font-size: clamp(1.75rem, 4vw, 2.25rem); letter-spacing: -0.02em; margin-bottom: 16px; color: #f5f5f5; }
        .lp-h2-sub { color: #888888; font-size: 16px; max-width: 520px; margin: 0 auto; line-height: 1.6; }
        .lp-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .lp-card { background: #161616; border: 1px solid #222222; border-radius: 12px; padding: 24px; transition: border-color 200ms, box-shadow 200ms; }
        .lp-card:hover { border-color: rgba(245,192,0,0.2); box-shadow: 0 0 20px rgba(245,192,0,0.08); }
        .lp-card-icon { width: 40px; height: 40px; border-radius: 8px; background: rgba(245,192,0,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
        .lp-card-title { font-weight: 900; font-size: 18px; margin-bottom: 8px; color: #f5f5f5; }
        .lp-card-desc { color: #888888; font-size: 14px; line-height: 1.6; }
        .lp-how { padding: 96px 20px; background: #1a1a1a; border-top: 1px solid #1c1c1c; border-bottom: 1px solid #1c1c1c; }
        .lp-how-inner { max-width: 960px; margin: 0 auto; }
        .lp-grid-3-how { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 48px; text-align: center; }
        .lp-step-num { width: 56px; height: 56px; border-radius: 16px; background: #F5C000; color: #111111; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 0 24px rgba(245,192,0,0.25); }
        .lp-step-title { font-weight: 900; font-size: 18px; margin-bottom: 8px; color: #f5f5f5; }
        .lp-step-desc { color: #888888; font-size: 14px; line-height: 1.6; }
        .lp-pricing { padding: 96px 20px; }
        .lp-pricing-inner { max-width: 800px; margin: 0 auto; }
        .lp-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
        .lp-plan { background: #161616; border: 1px solid #222222; border-radius: 12px; padding: 28px; }
        .lp-plan-pro { background: #161616; border: 1px solid rgba(245,192,0,0.3); border-radius: 12px; padding: 28px; position: relative; box-shadow: 0 0 32px rgba(245,192,0,0.08); }
        .lp-plan-badge { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); padding: 4px 14px; border-radius: 9999px; background: #F5C000; color: #111111; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap; }
        .lp-plan-label { font-family: var(--font-geist-mono, monospace); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #444444; margin-bottom: 8px; }
        .lp-plan-price { font-weight: 900; font-size: 48px; letter-spacing: -0.04em; color: #f5f5f5; line-height: 1; }
        .lp-plan-price-pro { font-weight: 900; font-size: 48px; letter-spacing: -0.04em; color: #F5C000; line-height: 1; }
        .lp-plan-per { color: #888888; font-size: 14px; margin-bottom: 8px; }
        .lp-plan-desc { color: #888888; font-size: 14px; margin-top: 8px; }
        .lp-plan-list { list-style: none; padding: 0; margin: 0 0 32px; display: flex; flex-direction: column; gap: 10px; }
        .lp-plan-item { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #f5f5f5; }
        .lp-plan-btn-free { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px 0; border-radius: 8px; border: 1.5px solid #2a2a2a; background: transparent; color: #f5f5f5; font-weight: 700; font-size: 14px; text-decoration: none; transition: border-color 150ms; }
        .lp-plan-btn-free:hover { border-color: rgba(245,192,0,0.3); }
        .lp-plan-btn-pro { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px 0; border-radius: 8px; background: #F5C000; color: #111111; font-weight: 700; font-size: 14px; text-decoration: none; box-shadow: 0 0 20px rgba(245,192,0,0.2); transition: background-color 150ms; }
        .lp-plan-btn-pro:hover { background: #C49800; }
        .lp-cta-section { padding: 96px 20px; background: #1a1a1a; border-top: 1px solid #1c1c1c; }
        .lp-cta-inner { max-width: 640px; margin: 0 auto; text-align: center; position: relative; }
        .lp-footer { border-top: 1px solid #1c1c1c; padding: 40px 20px; }
        .lp-footer-inner { max-width: 1120px; margin: 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; }
        .lp-footer-logo { display: flex; align-items: center; gap: 12px; }
        .lp-footer-logo-mark { display: flex; align-items: center; gap: 8px; }
        .lp-footer-tile { position: relative; width: 28px; height: 28px; background: #fff; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
        .lp-footer-dot { position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; background: #F5C000; border-radius: 50%; border: 2px solid #111111; }
        .lp-footer-wordmark { font-weight: 900; font-size: 20px; letter-spacing: -0.03em; color: #fff; }
        .lp-footer-by { color: #444444; font-size: 12px; font-family: var(--font-geist-mono, monospace); }
        .lp-footer-links { display: flex; align-items: center; gap: 24px; }
        .lp-footer-link { color: #888888; font-size: 12px; font-family: var(--font-geist-mono, monospace); text-decoration: none; transition: color 150ms; }
        .lp-footer-link:hover { color: #F5C000; }
        .lp-footer-status { display: flex; align-items: center; gap: 6px; }
        .lp-status-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ADB4A; display: inline-block; }
        .lp-footer-copy { color: #444444; font-size: 12px; font-family: var(--font-geist-mono, monospace); }
        .lp-amber { color: #F5C000; }
      `}</style>

      <div className="lp-body">

        {/* ── Nav ── */}
        <nav className="lp-nav">
          <div className="lp-nav-inner">
            <Link href="/" className="lp-logo">
              <div className="lp-logo-wrap">
                <div className="lp-logo-tile">
                  <div className="lp-logo-dot" />
                  <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                    <circle cx="11" cy="11" r="5" fill="#111"/>
                    <circle cx="29" cy="29" r="5" fill="#111"/>
                    <path d="M11 16 L11 25 Q11 29 15 29 L24 29" stroke="#111" strokeWidth="3" strokeLinecap="round" fill="none"/>
                    <path d="M22 25.5 L26 29 L22 32.5" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </div>
                <span className="lp-wordmark">nec<span className="lp-wordmark-acc">tr</span></span>
              </div>
            </Link>

            <div className="lp-nav-links">
              {[['Features', '#features'], ['How it works', '#how-it-works'], ['Pricing', '#pricing']].map(([label, href]) => (
                <a key={label} href={href} className="lp-nav-link">{label}</a>
              ))}
            </div>

            <a href={`${API_URL}/auth/github`} className="lp-btn-primary">
              <Github size={15} />
              Sign in with GitHub
            </a>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section className="lp-hero">
          <div className="lp-grid-bg" />
          <div className="lp-glow" />
          <div className="lp-hero-inner">
            <div className="lp-badge">
              <div className="lp-badge-dot" />
              <span className="lp-badge-text">AI-Powered · Live on Railway</span>
            </div>
            <h1 className="lp-h1">
              Your engineering team&apos;s{' '}
              <span className="lp-gradient-text">AI copilot</span>
            </h1>
            <p className="lp-sub">
              Nectr monitors your GitHub workflow, reviews every PR with AI, builds a knowledge graph of your codebase,
              and surfaces team insights — so your engineers spend less time on reviews and more time shipping.
            </p>
            <div className="lp-ctas">
              <a href={`${API_URL}/auth/github`} className="lp-btn-primary-lg">
                <Github size={18} />
                Start Free with GitHub
                <ArrowRight size={16} />
              </a>
              <a href="#features" className="lp-btn-secondary">
                See Features
              </a>
            </div>
            <p className="lp-hint">No credit card · Free for individuals · Takes 2 minutes to set up</p>
          </div>
        </section>

        {/* ── Social proof strip ── */}
        <div className="lp-strip">
          <div className="lp-strip-inner">
            {[
              { icon: GitPullRequest, text: 'PR reviews automated' },
              { icon: Clock,          text: 'Under 60s per review' },
              { icon: TrendingUp,     text: 'Confidence-gated'     },
              { icon: Shield,         text: 'Secure by default'    },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="lp-strip-item">
                <Icon size={14} style={{ color: '#F5C000' }} />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Features ── */}
        <section id="features" className="lp-features">
          <div className="lp-features-inner">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Features</span>
              <h2 className="lp-h2">Everything your team needs</h2>
              <p className="lp-h2-sub">
                From AI-powered PR reviews to deep team analytics — Nectr covers the full developer workflow.
              </p>
            </div>
            <div className="lp-grid-3">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="lp-card">
                  <div className="lp-card-icon">
                    <Icon size={18} style={{ color: '#F5C000' }} />
                  </div>
                  <h3 className="lp-card-title">{title}</h3>
                  <p className="lp-card-desc">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how-it-works" className="lp-how">
          <div className="lp-how-inner">
            <div className="lp-section-head">
              <span className="lp-eyebrow">How it works</span>
              <h2 className="lp-h2" style={{ marginBottom: 0 }}>Up and running in 2 minutes</h2>
            </div>
            <div className="lp-grid-3-how">
              {STEPS.map(({ step, title, desc }) => (
                <div key={step}>
                  <div className="lp-step-num">{step}</div>
                  <h3 className="lp-step-title">{title}</h3>
                  <p className="lp-step-desc">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="lp-pricing">
          <div className="lp-pricing-inner">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Pricing</span>
              <h2 className="lp-h2">Start free, scale when ready</h2>
              <p style={{ color: '#888888', fontSize: 16 }}>No hidden fees. No vendor lock-in.</p>
            </div>
            <div className="lp-grid-2">

              {/* Free */}
              <div className="lp-plan">
                <p className="lp-plan-label">Free</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <span className="lp-plan-price">$0</span>
                  <span className="lp-plan-per">/ forever</span>
                </div>
                <p className="lp-plan-desc">Perfect for solo developers and open-source projects.</p>
                <ul className="lp-plan-list" style={{ marginTop: 20 }}>
                  {FREE_FEATURES.map((f) => (
                    <li key={f} className="lp-plan-item">
                      <Check size={14} style={{ color: '#4ADB4A', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={`${API_URL}/auth/github`} className="lp-plan-btn-free">
                  Start Free
                </a>
              </div>

              {/* Pro */}
              <div className="lp-plan-pro">
                <span className="lp-plan-badge">Most Popular</span>
                <p className="lp-plan-label">Pro</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <span className="lp-plan-price-pro">$15</span>
                  <span className="lp-plan-per">/ month per seat</span>
                </div>
                <p className="lp-plan-desc">For engineering teams that need full visibility and control.</p>
                <ul className="lp-plan-list" style={{ marginTop: 20 }}>
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="lp-plan-item">
                      <Check size={14} style={{ color: '#F5C000', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={`${API_URL}/auth/github`} className="lp-plan-btn-pro">
                  Start Free Trial
                  <ArrowRight size={14} />
                </a>
              </div>

            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="lp-cta-section">
          <div className="lp-cta-inner">
            <div className="lp-grid-bg" style={{ borderRadius: 16 }} />
            <span className="lp-eyebrow" style={{ position: 'relative' }}>Get Started</span>
            <h2 className="lp-h2" style={{ position: 'relative' }}>
              Ship faster with <span className="lp-amber">AI code review</span>
            </h2>
            <p style={{ color: '#888888', fontSize: 16, marginBottom: 40, lineHeight: 1.65, position: 'relative' }}>
              Join engineers who use Nectr to catch bugs earlier, understand their team better, and ship with confidence.
            </p>
            <a href={`${API_URL}/auth/github`} className="lp-btn-primary-xl" style={{ position: 'relative' }}>
              <Github size={20} />
              Start Free with GitHub
              <ArrowRight size={18} />
            </a>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="lp-footer">
          <div className="lp-footer-inner">
            <div className="lp-footer-logo">
              <div className="lp-footer-logo-mark">
                <div className="lp-footer-tile">
                  <div className="lp-footer-dot" />
                  <svg width="15" height="15" viewBox="0 0 40 40" fill="none">
                    <circle cx="11" cy="11" r="5" fill="#111"/>
                    <circle cx="29" cy="29" r="5" fill="#111"/>
                    <path d="M11 16 L11 25 Q11 29 15 29 L24 29" stroke="#111" strokeWidth="3" strokeLinecap="round" fill="none"/>
                    <path d="M22 25.5 L26 29 L22 32.5" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </div>
                <span className="lp-footer-wordmark">nec<span className="lp-wordmark-acc">tr</span></span>
              </div>
              <span className="lp-footer-by">by Dhanush Chalicheemala</span>
            </div>

            <div className="lp-footer-links">
              <a href="https://x.com/dhanush_chali" target="_blank" rel="noopener noreferrer" className="lp-footer-link">Twitter</a>
              <a href={`${API_URL}/docs`} target="_blank" rel="noopener noreferrer" className="lp-footer-link">API Docs</a>
              <a href={`${API_URL}/health`} target="_blank" rel="noopener noreferrer" className="lp-footer-link lp-footer-status">
                <span className="lp-status-dot" />
                System Status
              </a>
            </div>

            <p className="lp-footer-copy">© {new Date().getFullYear()} Nectr. All rights reserved.</p>
          </div>
        </footer>

      </div>
    </>
  );
}
