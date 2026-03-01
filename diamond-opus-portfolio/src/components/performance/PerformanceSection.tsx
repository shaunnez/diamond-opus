import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import AnimatedCounter from '../shared/AnimatedCounter';
import { easing } from '../../utils/constants';

function CircularGauge({
  value,
  label,
  suffix,
  color,
  delay,
  inView,
}: {
  value: number;
  label: string;
  suffix: string;
  color: string;
  delay: number;
  inView: boolean;
}) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const fraction = value / 100;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-28 w-28 sm:h-36 sm:w-36">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#E8E5E0" strokeWidth="6" />
          <motion.circle
            cx="70" cy="70" r={radius} fill="none" stroke={color}
            strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={inView ? { strokeDashoffset: circumference * (1 - fraction) } : {}}
            transition={{ duration: 1.5, delay, ease: easing.luxury }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-xl font-600 sm:text-2xl" style={{ color }}>
            <AnimatedCounter target={value} suffix={suffix} duration={1500} />
          </span>
        </div>
      </div>
      <span className="mt-2 font-sans text-[10px] uppercase tracking-[0.06em] text-warm-gray-500 sm:mt-3 sm:text-xs sm:tracking-[0.08em]">
        {label}
      </span>
    </div>
  );
}

const cacheFlow = [
  { label: 'Request', color: '#6B6B6B' },
  { label: 'SHA-256', color: '#6B6B6B' },
  { label: 'Version', color: '#B8860B' },
  { label: 'LRU', color: '#B8860B' },
  { label: 'HIT/MISS', color: '#2D6A4F' },
];

export default function PerformanceSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="performance">
      <div ref={ref}>
        <SectionTitle
          title="Millisecond Precision"
          subtitle="Version-keyed LRU cache with ETag support and Cloudflare CDN"
        />

        {/* Gauges */}
        <div className="mt-8 flex flex-wrap justify-center gap-6 sm:mt-12 sm:gap-12">
          <CircularGauge value={95} label="Cache Hit Rate" suffix="%" color="#B8860B" delay={0.2} inView={inView} />
          <CircularGauge value={50} label="Avg Response" suffix="ms" color="#2D6A4F" delay={0.4} inView={inView} />
          <CircularGauge value={85} label="ETag 304 Rate" suffix="%" color="#0078D4" delay={0.6} inView={inView} />
        </div>

        {/* Cache flow */}
        <motion.div
          className="mt-10 sm:mt-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1, duration: 0.8, ease: easing.luxury }}
        >
          <h3 className="mb-4 text-center font-sans text-[10px] uppercase tracking-[0.08em] text-warm-gray-400 sm:mb-6 sm:text-xs">
            Cache Resolution Flow
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
            {cacheFlow.map((step, i) => (
              <div key={step.label} className="flex items-center gap-1.5 sm:gap-2">
                <div className="rounded-md border border-border px-2.5 py-1.5 sm:px-4 sm:py-2">
                  <span className="font-mono text-[10px] sm:text-xs" style={{ color: step.color }}>
                    {step.label}
                  </span>
                </div>
                {i < cacheFlow.length - 1 && (
                  <svg viewBox="0 0 24 24" className="hidden h-3 w-3 text-warm-gray-400 sm:block" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Invalidation */}
        <motion.div
          className="mx-auto mt-8 max-w-[600px] rounded-lg border border-border bg-pearl p-4 text-center sm:mt-10 sm:p-6"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 1.4, duration: 0.8 }}
        >
          <p className="font-sans text-xs leading-relaxed text-warm-gray-500 sm:text-sm">
            <span className="font-500 text-charcoal">Version-keyed invalidation:</span>{' '}
            Consolidator increments{' '}
            <span className="font-mono text-gold">dataset_versions</span>{' '}
            after each run. API polls every 30s — version change makes old entries stale.
          </p>
        </motion.div>
      </div>
    </SectionWrapper>
  );
}
