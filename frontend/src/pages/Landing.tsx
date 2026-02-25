import { Github, Zap, Shield, BarChart2, ArrowRight, GitPullRequest, CheckCircle, AlertTriangle } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b-2 border-[#222222] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#F5C800] flex items-center justify-center">
            <Zap className="w-5 h-5 text-black" strokeWidth={2.5} />
          </div>
          <span className="text-[#F5C800] font-black text-xl tracking-widest uppercase">NECTR</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-[#555] text-sm uppercase tracking-wider hidden md:block">AI Code Review</span>
          <a
            href={`${BACKEND_URL}/auth/github`}
            className="btn-primary flex items-center gap-2"
          >
            <Github size={16} />
            Sign in with GitHub
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-8 pt-24 pb-20 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 border border-[#F5C800] px-3 py-1 mb-8">
          <span className="w-2 h-2 bg-[#F5C800] animate-pulse" />
          <span className="text-[#F5C800] text-xs font-bold uppercase tracking-widest">Now in Beta</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-black uppercase leading-none tracking-tight mb-6">
          AI Code Review
          <br />
          <span className="text-[#F5C800]">That Works</span>
          <br />
          Autonomously.
        </h1>

        <p className="text-[#999] text-lg max-w-xl mb-10 leading-relaxed">
          Connect your GitHub repo. Every PR gets reviewed automatically — summary, issues, confidence score, and verdict. No setup required.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <a
            href={`${BACKEND_URL}/auth/github`}
            className="btn-primary flex items-center justify-center gap-2 text-base px-8 py-3"
          >
            <Github size={18} />
            Get Started Free
            <ArrowRight size={16} />
          </a>
          <a
            href="#how-it-works"
            className="btn-secondary flex items-center justify-center gap-2 text-base px-8 py-3"
          >
            How it works
          </a>
        </div>

        {/* Social proof */}
        <div className="mt-12 flex items-center gap-6 text-sm text-[#555]">
          <span className="flex items-center gap-2">
            <CheckCircle size={14} className="text-[#F5C800]" />
            Zero config
          </span>
          <span className="flex items-center gap-2">
            <CheckCircle size={14} className="text-[#F5C800]" />
            Works on every PR
          </span>
          <span className="flex items-center gap-2">
            <CheckCircle size={14} className="text-[#F5C800]" />
            Built on Claude AI
          </span>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t-2 border-[#222] px-8 py-20 max-w-5xl mx-auto">
        <p className="section-label mb-8">How it works</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              title: 'Connect Repo',
              desc: 'Sign in with GitHub and connect your repositories. NECTR installs a webhook automatically.',
              icon: <Github size={20} />,
            },
            {
              step: '02',
              title: 'PR Opens',
              desc: 'When a pull request is opened or updated, NECTR instantly picks it up and starts the review.',
              icon: <GitPullRequest size={20} />,
            },
            {
              step: '03',
              title: 'AI Review Posted',
              desc: 'Claude AI analyzes the diff, identifies real issues, gives a confidence score and verdict.',
              icon: <CheckCircle size={20} />,
            },
          ].map((item) => (
            <div key={item.step} className="card-yellow">
              <div className="flex items-start justify-between mb-4">
                <span className="text-[#F5C800]">{item.icon}</span>
                <span className="text-[#333] font-black text-2xl font-mono">{item.step}</span>
              </div>
              <h3 className="text-white font-bold text-lg uppercase tracking-wide mb-2">{item.title}</h3>
              <p className="text-[#999] text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t-2 border-[#222] px-8 py-20 max-w-5xl mx-auto">
        <p className="section-label mb-8">What you get</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              icon: <Zap size={16} />,
              title: 'Autonomous Reviews',
              desc: 'Every PR reviewed automatically. No manual triggers.',
            },
            {
              icon: <AlertTriangle size={16} />,
              title: 'Real Issue Detection',
              desc: 'Only flags real, PR-specific issues. No generic filler.',
            },
            {
              icon: <BarChart2 size={16} />,
              title: 'Review Analytics',
              desc: 'Track review trends, success rates, and processing times.',
            },
            {
              icon: <Shield size={16} />,
              title: 'Confidence Score',
              desc: 'Every review rated 1–5 on merge safety.',
            },
          ].map((f) => (
            <div key={f.title} className="card flex items-start gap-4">
              <span className="text-[#F5C800] mt-0.5">{f.icon}</span>
              <div>
                <h4 className="text-white font-bold text-sm uppercase tracking-wide mb-1">{f.title}</h4>
                <p className="text-[#666] text-sm">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t-2 border-[#222] px-8 py-24 text-center">
        <h2 className="text-4xl md:text-5xl font-black uppercase mb-6">
          Ready to ship <span className="text-[#F5C800]">better code?</span>
        </h2>
        <a
          href={`${BACKEND_URL}/auth/github`}
          className="btn-primary inline-flex items-center gap-2 text-base px-10 py-4"
        >
          <Github size={20} />
          Sign in with GitHub — it's free
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-[#222] px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#F5C800] font-black text-sm tracking-widest uppercase">NECTR</span>
        </div>
        <p className="text-[#333] text-xs">
          Built by{' '}
          <a href="https://x.com/dhanush_chali" className="text-[#F5C800] hover:underline" target="_blank" rel="noreferrer">
            Dhanush Chalicheemala
          </a>
        </p>
      </footer>
    </div>
  );
}
