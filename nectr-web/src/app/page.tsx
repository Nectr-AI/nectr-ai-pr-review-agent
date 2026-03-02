import Link from 'next/link';
import Image from 'next/image';
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
    <div className="min-h-screen bg-surface text-content-primary font-sans">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-surface-border bg-surface/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/assets/nectr-logo-dark.svg" alt="Nectr" width={88} height={28} priority />
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {[['Features', '#features'], ['How it works', '#how-it-works'], ['Pricing', '#pricing']].map(([label, href]) => (
              <a key={label} href={href} className="text-sm text-content-secondary hover:text-content-primary transition-colors font-medium">
                {label}
              </a>
            ))}
          </div>
          <a
            href={`${API_URL}/auth/github`}
            className="inline-flex items-center gap-2 bg-amber text-surface font-bold text-sm px-5 py-2.5 rounded-md hover:bg-amber-dark transition-colors shadow-amber-glow"
          >
            <Github size={16} />
            Sign in with GitHub
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-5 overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-40" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-amber/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber/10 border border-amber/20 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
            <span className="text-amber text-xs font-mono uppercase tracking-wider">AI-Powered · Live on Railway</span>
          </div>
          <h1 className="text-display font-black tracking-tightest leading-tight mb-6">
            Your engineering team&apos;s{' '}
            <span className="text-gradient">AI copilot</span>
          </h1>
          <p className="text-body-lg text-content-secondary max-w-2xl mx-auto leading-relaxed mb-10">
            Nectr monitors your GitHub workflow, reviews every PR with AI, builds a knowledge graph of your codebase,
            and surfaces team insights — so your engineers spend less time on reviews and more time shipping.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`${API_URL}/auth/github`}
              className="inline-flex items-center justify-center gap-2 bg-amber text-surface font-black text-base px-8 py-4 rounded-lg hover:bg-amber-dark transition-all shadow-amber-glow-lg hover:scale-[1.02] active:scale-100"
            >
              <Github size={18} />
              Start Free with GitHub
              <ArrowRight size={16} />
            </a>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 bg-transparent text-content-primary font-bold text-base border border-surface-border px-8 py-4 rounded-lg hover:border-amber/30 hover:text-amber transition-colors"
            >
              See Features
            </a>
          </div>
          <p className="text-content-muted text-sm mt-6 font-mono">No credit card · Free for individuals · Takes 2 minutes to set up</p>
        </div>
      </section>

      {/* Social proof strip */}
      <div className="border-y border-surface-border bg-surface-elevated py-5">
        <div className="max-w-5xl mx-auto px-5 flex flex-wrap items-center justify-center gap-8 text-content-secondary text-sm font-mono">
          {[
            { icon: GitPullRequest, text: 'PR reviews automated' },
            { icon: Clock,          text: 'Under 60s per review'  },
            { icon: TrendingUp,     text: 'Confidence-gated'      },
            { icon: Shield,         text: 'Secure by default'     },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2">
              <Icon size={14} className="text-amber" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="features" className="py-24 px-5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="label-eyebrow block mb-3">Features</span>
            <h2 className="text-h1 font-black tracking-tight mb-4">Everything your team needs</h2>
            <p className="text-content-secondary text-body-lg max-w-2xl mx-auto">
              From AI-powered PR reviews to deep team analytics — Nectr covers the full developer workflow.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="nectr-card hover:border-amber/20 hover:shadow-amber-glow transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-amber/10 flex items-center justify-center mb-4 group-hover:bg-amber/20 transition-colors">
                  <Icon size={18} className="text-amber" />
                </div>
                <h3 className="font-black text-h3 mb-2">{title}</h3>
                <p className="text-content-secondary text-body-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-5 bg-surface-elevated border-y border-surface-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="label-eyebrow block mb-3">How it works</span>
            <h2 className="text-h1 font-black tracking-tight mb-4">Up and running in 2 minutes</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber text-surface font-black text-lg flex items-center justify-center mx-auto mb-5 shadow-amber-glow">
                  {step}
                </div>
                <h3 className="font-black text-h3 mb-2">{title}</h3>
                <p className="text-content-secondary text-body-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="label-eyebrow block mb-3">Pricing</span>
            <h2 className="text-h1 font-black tracking-tight mb-4">Start free, scale when ready</h2>
            <p className="text-content-secondary text-body-lg">No hidden fees. No vendor lock-in.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Free */}
            <div className="nectr-card">
              <div className="mb-6">
                <p className="label-mono mb-2">Free</p>
                <div className="flex items-end gap-2">
                  <span className="text-display font-black">$0</span>
                  <span className="text-content-secondary text-sm mb-2">/ forever</span>
                </div>
                <p className="text-content-secondary text-sm">Perfect for solo developers and open-source projects.</p>
              </div>
              <ul className="space-y-2.5 mb-8">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <Check size={14} className="text-success flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={`${API_URL}/auth/github`}
                className="btn-nectr-secondary w-full justify-center"
              >
                Start Free
              </a>
            </div>

            {/* Pro */}
            <div className="nectr-card border-amber/30 shadow-amber-glow relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 rounded-full bg-amber text-surface text-xs font-black uppercase tracking-wider">Most Popular</span>
              </div>
              <div className="mb-6">
                <p className="label-mono mb-2">Pro</p>
                <div className="flex items-end gap-2">
                  <span className="text-display font-black text-amber">$29</span>
                  <span className="text-content-secondary text-sm mb-2">/ month per team</span>
                </div>
                <p className="text-content-secondary text-sm">For engineering teams that need full visibility and control.</p>
              </div>
              <ul className="space-y-2.5 mb-8">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <Check size={14} className="text-amber flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={`${API_URL}/auth/github`}
                className="btn-nectr-primary w-full justify-center"
              >
                Start Free Trial
                <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-5 bg-surface-elevated border-t border-surface-border">
        <div className="max-w-3xl mx-auto text-center relative">
          <div className="absolute inset-0 grid-pattern opacity-30 -z-10" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-48 bg-amber/5 rounded-full blur-3xl -z-10" />
          <span className="label-eyebrow block mb-4">Get Started</span>
          <h2 className="text-h1 font-black tracking-tight mb-4">
            Ship faster with{' '}
            <span className="text-amber">AI code review</span>
          </h2>
          <p className="text-content-secondary text-body-lg mb-10 max-w-xl mx-auto">
            Join engineers who use Nectr to catch bugs earlier, understand their team better, and ship with confidence.
          </p>
          <a
            href={`${API_URL}/auth/github`}
            className="inline-flex items-center gap-3 bg-amber text-surface font-black text-lg px-10 py-5 rounded-xl hover:bg-amber-dark transition-all shadow-amber-glow-lg hover:scale-[1.02] active:scale-100"
          >
            <Github size={20} />
            Start Free with GitHub
            <ArrowRight size={18} />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-border py-10 px-5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <Image src="/assets/nectr-logo-dark.svg" alt="Nectr" width={72} height={22} />
            <span className="text-content-muted text-xs font-mono">by Dhanush Chalicheemala</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-content-secondary font-mono">
            <a href="https://x.com/dhanush_chali" target="_blank" rel="noopener noreferrer" className="hover:text-amber transition-colors">Twitter</a>
            <a href={`${API_URL}/docs`} target="_blank" rel="noopener noreferrer" className="hover:text-amber transition-colors">API Docs</a>
            <a href={`${API_URL}/health`} target="_blank" rel="noopener noreferrer" className="hover:text-amber transition-colors flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              System Status
            </a>
          </div>
          <p className="text-content-muted text-xs font-mono">© {new Date().getFullYear()} Nectr. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
