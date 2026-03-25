'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  GitPullRequest, BarChart3, Brain, Zap, Shield, Users,
  ArrowRight, Github, Clock, TrendingUp, ChevronRight, Code2, GitBranch,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://devkit-production.up.railway.app';

/* ── Data ── */
const FEATURES = [
  {
    num: '01',
    icon: GitPullRequest,
    title: 'Smart Code Review',
    desc: 'AI reviews every PR in seconds — inline suggestions, verdict, and confidence score.',
    detail: 'No bot noise, only real actionable feedback.',
  },
  {
    num: '02',
    icon: BarChart3,
    title: 'Team Analytics',
    desc: 'Merge times, author breakdowns, issue frequency, verdict distribution.',
    detail: 'Know where your team is thriving and where it\'s stuck.',
  },
  {
    num: '03',
    icon: Brain,
    title: 'Project Memory',
    desc: 'Nectr learns your codebase over time. Project rules, dev patterns, architecture decisions.',
    detail: 'All applied to every new review.',
  },
  {
    num: '04',
    icon: Zap,
    title: 'Zero Config',
    desc: 'Sign in with GitHub, connect a repo, and Nectr starts reviewing in minutes.',
    detail: 'No YAML, no config files, no DSL to learn.',
  },
  {
    num: '05',
    icon: Shield,
    title: 'Enterprise Security',
    desc: 'httpOnly JWT cookies, encrypted GitHub tokens, per-repo webhook secrets.',
    detail: 'Built for teams that take security seriously.',
  },
  {
    num: '06',
    icon: Users,
    title: 'Developer Profiles',
    desc: 'AI-built profiles for every contributor — strengths, recurring patterns, preferred areas.',
    detail: 'Give better code review feedback.',
  },
];

const STEPS = [
  { num: '01', title: 'Sign in with GitHub', desc: 'OAuth in one click. No password, no email setup.' },
  { num: '02', title: 'Connect a Repo', desc: 'Pick any repo. Nectr installs a webhook and scans automatically.' },
  { num: '03', title: 'Get AI Reviews', desc: 'Every new PR gets reviewed instantly with inline suggestions.' },
];

const WORDS = ['AI copilot', 'code reviewer', 'knowledge graph', 'analytics engine'];

/* ── Text scramble hook ── */
function useTextScramble(words: string[], interval = 3000) {
  const [text, setText] = useState(words[0]);
  const [isScrambling, setIsScrambling] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let timeout: NodeJS.Timeout;

    const scrambleTo = (target: string) => {
      setIsScrambling(true);
      const maxLen = Math.max(text.length, target.length);
      let frame = 0;
      const totalFrames = 14;

      const tick = () => {
        frame++;
        const progress = frame / totalFrames;
        let result = '';
        for (let i = 0; i < maxLen; i++) {
          if (i < target.length) {
            if (progress > (i / maxLen) * 0.8 + 0.2) {
              result += target[i];
            } else {
              result += chars[Math.floor(Math.random() * chars.length)];
            }
          }
        }
        setText(result);
        if (frame < totalFrames) {
          timeout = setTimeout(tick, 35);
        } else {
          setText(target);
          setIsScrambling(false);
        }
      };
      tick();
    };

    const cycle = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % words.length;
      scrambleTo(words[indexRef.current]);
    }, interval);

    return () => {
      clearInterval(cycle);
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { text, isScrambling };
}

/* ── Intersection observer hook ── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, visible };
}

/* ── Particle canvas ── */
function ParticleGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];
    const PARTICLE_COUNT = 60;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 192, 0, ${p.alpha})`;
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(245, 192, 0, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

/* ── Main page ── */
export default function LandingPage() {
  const { text: scrambledText } = useTextScramble(WORDS, 3000);
  const statementReveal = useReveal();
  const featuresReveal = useReveal();
  const stepsReveal = useReveal();
  const ctaReveal = useReveal();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <style>{`
        /* ── Keyframes ── */
        @keyframes lp-fade-up {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lp-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes lp-breathe {
          0%, 100% { transform: translate(-50%, -50%) scale(1);    opacity: 0.5; }
          50%       { transform: translate(-50%, -50%) scale(1.3);  opacity: 1;   }
        }
        @keyframes lp-line-grow {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        @keyframes lp-number-enter {
          from { opacity: 0; transform: scale(0.8) rotate(-8deg); }
          to   { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes lp-slide-up {
          from { opacity: 0; transform: translateY(60px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lp-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes lp-gradient-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes lp-float {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-8px); }
        }

        /* ── Reveal system ── */
        .lp-reveal-section {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 800ms cubic-bezier(0.23,1,0.32,1),
                      transform 800ms cubic-bezier(0.23,1,0.32,1);
        }
        .lp-reveal-section.lp-visible { opacity: 1; transform: translateY(0); }

        /* ── Base ── */
        .lp-body { min-height: 100vh; background: #0a0a0a; color: #f5f5f5; font-family: var(--font-dm-sans, 'DM Sans', sans-serif); overflow-x: hidden; }

        /* ── Nav ── */
        .lp-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 50; border-bottom: 1px solid rgba(255,255,255,0.04); background: rgba(10,10,10,0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); animation: lp-fade-in 600ms ease-out both; }
        .lp-nav-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
        .lp-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .lp-logo-wrap { display: flex; align-items: center; gap: 10px; }
        .lp-logo-tile { position: relative; width: 36px; height: 36px; background: #fff; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .lp-logo-dot { position: absolute; top: -5px; right: -5px; width: 11px; height: 11px; background: #F5C000; border-radius: 50%; border: 2.5px solid #0a0a0a; }
        .lp-wordmark { font-weight: 900; font-size: 26px; letter-spacing: -0.03em; line-height: 1; color: #fff; }
        .lp-wordmark-acc { color: #F5C000; }
        .lp-nav-links { display: flex; align-items: center; gap: 36px; }
        .lp-nav-link { font-size: 13px; color: #666; text-decoration: none; font-weight: 500; transition: color 200ms; letter-spacing: 0.01em; }
        .lp-nav-link:hover { color: #f5f5f5; }

        /* ── Buttons ── */
        .lp-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: #F5C000; color: #0a0a0a; font-weight: 700; font-size: 13px; padding: 10px 20px; border-radius: 8px; text-decoration: none; letter-spacing: -0.01em; transition: all 200ms cubic-bezier(0.23,1,0.32,1); }
        .lp-btn-primary:hover { background: #fff; box-shadow: 0 0 30px rgba(245,192,0,0.25); }
        .lp-btn-primary:active { transform: scale(0.97); }

        .lp-btn-primary-xl { display: inline-flex; align-items: center; gap: 12px; background: #F5C000; color: #0a0a0a; font-weight: 900; font-size: 16px; padding: 20px 44px; border-radius: 12px; text-decoration: none; transition: all 200ms cubic-bezier(0.23,1,0.32,1); position: relative; overflow: hidden; }
        .lp-btn-primary-xl::before { content: ''; position: absolute; inset: -2px; border-radius: 14px; background: linear-gradient(135deg, #F5C000, #fff, #F5C000); background-size: 200% 200%; animation: lp-gradient-shift 3s ease infinite; opacity: 0; transition: opacity 300ms; z-index: -1; }
        .lp-btn-primary-xl:hover { background: #fff; transform: translateY(-2px); box-shadow: 0 8px 40px rgba(245,192,0,0.3); }
        .lp-btn-primary-xl:hover::before { opacity: 1; }
        .lp-btn-primary-xl:active { transform: scale(0.97) translateY(0); }

        .lp-btn-secondary { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: #888; font-weight: 600; font-size: 15px; padding: 16px 32px; border-radius: 10px; border: 1px solid #222; text-decoration: none; transition: all 200ms cubic-bezier(0.23,1,0.32,1); }
        .lp-btn-secondary:hover { border-color: #F5C000; color: #F5C000; }
        .lp-btn-secondary:active { transform: scale(0.97); }

        /* ── Hero ── */
        .lp-hero { position: relative; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 120px 24px 80px; overflow: hidden; }
        .lp-grid-bg { position: absolute; inset: 0; background-image: linear-gradient(rgba(245,192,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(245,192,0,0.02) 1px, transparent 1px); background-size: 48px 48px; pointer-events: none; mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 70%); -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 70%); }
        .lp-glow { position: absolute; top: 40%; left: 50%; width: 900px; height: 600px; background: radial-gradient(ellipse, rgba(245,192,0,0.07) 0%, transparent 65%); pointer-events: none; animation: lp-breathe 8s ease-in-out infinite; }
        .lp-hero-inner { position: relative; max-width: 900px; margin: 0 auto; text-align: center; }

        /* Hero stagger */
        .lp-section-label { font-family: var(--font-geist-mono, monospace); font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: #444; margin-bottom: 32px; animation: lp-fade-up 900ms cubic-bezier(0.23,1,0.32,1) 0ms both; }
        .lp-h1 { font-weight: 900; font-size: clamp(2.8rem, 7vw, 4.5rem); letter-spacing: -0.04em; line-height: 1.05; margin-bottom: 12px; color: #f5f5f5; animation: lp-fade-up 900ms cubic-bezier(0.23,1,0.32,1) 100ms both; }
        .lp-h1-scramble { display: inline-block; color: #F5C000; font-family: var(--font-geist-mono, monospace); position: relative; min-width: 280px; }
        .lp-h1-scramble::after { content: ''; display: inline-block; width: 3px; height: 0.85em; background: #F5C000; margin-left: 4px; vertical-align: text-bottom; animation: lp-cursor-blink 1s ease-in-out infinite; }
        .lp-sub { font-size: 17px; color: #666; max-width: 560px; margin: 24px auto 48px; line-height: 1.7; animation: lp-fade-up 900ms cubic-bezier(0.23,1,0.32,1) 250ms both; }
        .lp-ctas { display: flex; flex-direction: row; flex-wrap: wrap; gap: 16px; justify-content: center; animation: lp-fade-up 900ms cubic-bezier(0.23,1,0.32,1) 380ms both; }
        .lp-hint { color: #333; font-size: 12px; margin-top: 28px; font-family: var(--font-geist-mono, monospace); animation: lp-fade-up 900ms cubic-bezier(0.23,1,0.32,1) 500ms both; letter-spacing: 0.02em; }

        /* ── Metric strip ── */
        .lp-strip { border-top: 1px solid #151515; border-bottom: 1px solid #151515; background: #0d0d0d; padding: 24px 20px; }
        .lp-strip-inner { max-width: 960px; margin: 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 40px; }
        .lp-strip-item { display: flex; align-items: center; gap: 8px; color: #555; font-size: 12px; font-family: var(--font-geist-mono, monospace); letter-spacing: 0.02em; }

        /* ── Statement section (Decart-inspired big text) ── */
        .lp-statement { padding: 160px 24px; text-align: center; position: relative; }
        .lp-statement-text { font-weight: 900; font-size: clamp(2rem, 5.5vw, 3.5rem); letter-spacing: -0.04em; line-height: 1.15; color: #f5f5f5; max-width: 900px; margin: 0 auto; }
        .lp-statement-text .lp-dim { color: #333; }
        .lp-statement-coord { font-family: var(--font-geist-mono, monospace); font-size: 11px; color: #333; margin-top: 24px; letter-spacing: 0.05em; }

        /* ── Features — numbered sections ── */
        .lp-features { padding: 120px 24px; position: relative; }
        .lp-features-inner { max-width: 1100px; margin: 0 auto; }
        .lp-features-header { margin-bottom: 80px; }
        .lp-eyebrow { display: block; margin-bottom: 16px; font-family: var(--font-geist-mono, monospace); font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #444; }
        .lp-h2 { font-weight: 900; font-size: clamp(1.8rem, 4vw, 2.5rem); letter-spacing: -0.03em; margin-bottom: 16px; color: #f5f5f5; }

        /* Feature items — Decart-inspired numbered layout */
        .lp-feature-row { display: grid; grid-template-columns: 80px 1fr; gap: 0; border-top: 1px solid #181818; padding: 40px 0; transition: all 300ms cubic-bezier(0.23,1,0.32,1); position: relative; }
        .lp-feature-row:hover { background: rgba(245,192,0,0.02); }
        .lp-feature-row:last-child { border-bottom: 1px solid #181818; }
        .lp-feature-num { font-family: var(--font-geist-mono, monospace); font-size: 12px; color: #F5C000; letter-spacing: 0.1em; padding-top: 4px; opacity: 0.6; }
        .lp-feature-content { }
        .lp-feature-title { font-weight: 800; font-size: 22px; letter-spacing: -0.02em; color: #f5f5f5; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; }
        .lp-feature-icon { width: 36px; height: 36px; border-radius: 8px; background: rgba(245,192,0,0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .lp-feature-desc { color: #666; font-size: 15px; line-height: 1.65; max-width: 600px; }
        .lp-feature-detail { color: #444; font-size: 13px; margin-top: 4px; font-family: var(--font-geist-mono, monospace); }

        /* ── How it works — timeline ── */
        .lp-how { padding: 120px 24px; background: #0d0d0d; border-top: 1px solid #151515; position: relative; }
        .lp-how-inner { max-width: 700px; margin: 0 auto; }
        .lp-timeline { position: relative; padding-left: 80px; }
        .lp-timeline::before { content: ''; position: absolute; left: 35px; top: 0; bottom: 0; width: 1px; background: linear-gradient(to bottom, transparent, #222 10%, #222 90%, transparent); }
        .lp-timeline-item { position: relative; padding: 40px 0; }
        .lp-timeline-item:first-child { padding-top: 0; }
        .lp-timeline-num { position: absolute; left: -80px; top: 40px; width: 72px; height: 40px; display: flex; align-items: center; justify-content: center; font-family: var(--font-geist-mono, monospace); font-size: 13px; font-weight: 700; color: #F5C000; background: rgba(245,192,0,0.06); border: 1px solid rgba(245,192,0,0.15); border-radius: 8px; }
        .lp-timeline-item:first-child .lp-timeline-num { top: 0; }
        .lp-timeline-dot { position: absolute; left: -49px; top: 52px; width: 8px; height: 8px; border-radius: 50%; background: #F5C000; box-shadow: 0 0 12px rgba(245,192,0,0.4); }
        .lp-timeline-item:first-child .lp-timeline-dot { top: 12px; }
        .lp-timeline-title { font-weight: 800; font-size: 20px; letter-spacing: -0.02em; color: #f5f5f5; margin-bottom: 8px; }
        .lp-timeline-desc { color: #666; font-size: 15px; line-height: 1.6; }

        /* ── CTA ── */
        .lp-cta-section { padding: 160px 24px; position: relative; overflow: hidden; }
        .lp-cta-inner { max-width: 700px; margin: 0 auto; text-align: center; position: relative; z-index: 1; }
        .lp-cta-glow { position: absolute; top: 50%; left: 50%; width: 600px; height: 400px; background: radial-gradient(ellipse, rgba(245,192,0,0.06) 0%, transparent 65%); pointer-events: none; transform: translate(-50%, -50%); animation: lp-breathe 6s ease-in-out infinite; }

        /* ── Footer ── */
        .lp-footer { border-top: 1px solid #151515; padding: 48px 24px; }
        .lp-footer-inner { max-width: 1200px; margin: 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; }
        .lp-footer-logo { display: flex; align-items: center; gap: 12px; }
        .lp-footer-logo-mark { display: flex; align-items: center; gap: 8px; }
        .lp-footer-tile { position: relative; width: 28px; height: 28px; background: #fff; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
        .lp-footer-dot { position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; background: #F5C000; border-radius: 50%; border: 2px solid #0a0a0a; }
        .lp-footer-wordmark { font-weight: 900; font-size: 20px; letter-spacing: -0.03em; color: #fff; }
        .lp-footer-by { color: #333; font-size: 11px; font-family: var(--font-geist-mono, monospace); }
        .lp-footer-links { display: flex; align-items: center; gap: 28px; }
        .lp-footer-link { color: #555; font-size: 12px; font-family: var(--font-geist-mono, monospace); text-decoration: none; transition: color 200ms; letter-spacing: 0.02em; }
        .lp-footer-link:hover { color: #F5C000; }
        .lp-footer-status { display: flex; align-items: center; gap: 6px; }
        .lp-status-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ADB4A; display: inline-block; }
        .lp-footer-copy { color: #333; font-size: 11px; font-family: var(--font-geist-mono, monospace); }
        .lp-amber { color: #F5C000; }

        /* ── Stagger delays for features ── */
        .lp-stagger-1 { transition-delay: 0ms; }
        .lp-stagger-2 { transition-delay: 80ms; }
        .lp-stagger-3 { transition-delay: 160ms; }
        .lp-stagger-4 { transition-delay: 240ms; }
        .lp-stagger-5 { transition-delay: 320ms; }
        .lp-stagger-6 { transition-delay: 400ms; }

        .lp-feature-row-hidden { opacity: 0; transform: translateX(-20px); transition: opacity 600ms cubic-bezier(0.23,1,0.32,1), transform 600ms cubic-bezier(0.23,1,0.32,1); }
        .lp-feature-row-visible { opacity: 1; transform: translateX(0); }

        /* ── Reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
          .lp-reveal-section, .lp-feature-row-hidden { opacity: 1; transform: none; }
        }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .lp-nav-links { display: none; }
          .lp-h1 { font-size: clamp(2rem, 8vw, 3rem); }
          .lp-feature-row { grid-template-columns: 1fr; gap: 8px; padding: 28px 0; }
          .lp-feature-num { padding-top: 0; margin-bottom: 4px; }
          .lp-timeline { padding-left: 60px; }
          .lp-timeline::before { left: 20px; }
          .lp-timeline-num { left: -60px; width: 48px; height: 32px; font-size: 11px; }
          .lp-timeline-dot { left: -44px; }
          .lp-statement-text { font-size: clamp(1.5rem, 6vw, 2.5rem); }
          .lp-strip-inner { gap: 20px; }
        }
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
              {[['Features', '#features'], ['How it works', '#how-it-works']].map(([label, href]) => (
                <a key={label} href={href} className="lp-nav-link">{label}</a>
              ))}
            </div>

            <a href={`${API_URL}/auth/github`} className="lp-btn-primary">
              <Github size={14} />
              Sign in
            </a>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section className="lp-hero">
          <ParticleGrid />
          <div className="lp-grid-bg" />
          <div className="lp-glow" />
          <div className="lp-hero-inner">
            <p className="lp-section-label">/00 — Introduction</p>
            <h1 className="lp-h1">
              Your engineering team&apos;s<br />
              <span className="lp-h1-scramble">{mounted ? scrambledText : WORDS[0]}</span>
            </h1>
            <p className="lp-sub">
              Nectr reviews every PR with AI, builds a knowledge graph of your codebase,
              and surfaces team insights — so engineers ship faster.
            </p>
            <div className="lp-ctas">
              <a href={`${API_URL}/auth/github`} className="lp-btn-primary-xl">
                <Github size={18} />
                Start Free with GitHub
                <ArrowRight size={16} />
              </a>
              <a href="#features" className="lp-btn-secondary">
                Explore
                <ChevronRight size={16} />
              </a>
            </div>
            <p className="lp-hint">No credit card · Free for individuals · 2 min setup</p>
          </div>
        </section>

        {/* ── Metric strip ── */}
        <div className="lp-strip">
          <div className="lp-strip-inner">
            {[
              { icon: GitPullRequest, text: 'PR reviews automated' },
              { icon: Clock,          text: 'Under 60s per review' },
              { icon: TrendingUp,     text: 'Confidence-gated'     },
              { icon: Shield,         text: 'Secure by default'    },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="lp-strip-item">
                <Icon size={13} style={{ color: '#F5C000' }} />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Statement section (Decart-inspired) ── */}
        <section className="lp-statement">
          <div
            ref={statementReveal.ref}
            className={`lp-reveal-section ${statementReveal.visible ? 'lp-visible' : ''}`}
          >
            <p className="lp-statement-text">
              Ship code that matters.<br />
              <span className="lp-dim">We review the rest.</span>
            </p>
            <p className="lp-statement-coord">/B.01</p>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="lp-features">
          <div className="lp-features-inner">
            <div
              ref={featuresReveal.ref}
              className={`lp-features-header lp-reveal-section ${featuresReveal.visible ? 'lp-visible' : ''}`}
            >
              <span className="lp-eyebrow">/A.01 — Capabilities</span>
              <h2 className="lp-h2">Everything your team needs</h2>
            </div>

            {FEATURES.map(({ num, icon: Icon, title, desc, detail }, i) => (
              <div
                key={num}
                className={`lp-feature-row lp-feature-row-hidden lp-stagger-${i + 1} ${featuresReveal.visible ? 'lp-feature-row-visible' : ''}`}
              >
                <div className="lp-feature-num">/{num}</div>
                <div className="lp-feature-content">
                  <h3 className="lp-feature-title">
                    <div className="lp-feature-icon">
                      <Icon size={16} style={{ color: '#F5C000' }} />
                    </div>
                    {title}
                  </h3>
                  <p className="lp-feature-desc">{desc}</p>
                  <p className="lp-feature-detail">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works — timeline ── */}
        <section id="how-it-works" className="lp-how">
          <div className="lp-how-inner">
            <div
              ref={stepsReveal.ref}
              className={`lp-reveal-section ${stepsReveal.visible ? 'lp-visible' : ''}`}
              style={{ marginBottom: 64 }}
            >
              <span className="lp-eyebrow">/A.02 — Getting started</span>
              <h2 className="lp-h2">Up and running in 2 minutes</h2>
            </div>

            <div className={`lp-timeline lp-reveal-section ${stepsReveal.visible ? 'lp-visible' : ''}`} style={{ transitionDelay: '200ms' }}>
              {STEPS.map(({ num, title, desc }) => (
                <div key={num} className="lp-timeline-item">
                  <div className="lp-timeline-num">{num}</div>
                  <div className="lp-timeline-dot" />
                  <h3 className="lp-timeline-title">{title}</h3>
                  <p className="lp-timeline-desc">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="lp-cta-section">
          <div className="lp-cta-glow" />
          <div
            ref={ctaReveal.ref}
            className={`lp-cta-inner lp-reveal-section ${ctaReveal.visible ? 'lp-visible' : ''}`}
          >
            <span className="lp-eyebrow">/C.01 — Get Started</span>
            <h2 className="lp-h2" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', marginTop: 16 }}>
              Your codebase deserves<br />
              <span className="lp-amber">better reviews</span>
            </h2>
            <p style={{ color: '#555', fontSize: 16, marginBottom: 48, lineHeight: 1.7, marginTop: 16 }}>
              Join engineers who use Nectr to catch bugs earlier, understand their team better, and ship with confidence.
            </p>
            <a href={`${API_URL}/auth/github`} className="lp-btn-primary-xl">
              <Github size={18} />
              Start Free with GitHub
              <ArrowRight size={16} />
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
                Status
              </a>
            </div>

            <p className="lp-footer-copy">&copy; 2025 Nectr. All rights reserved.</p>
          </div>
        </footer>

      </div>
    </>
  );
}
