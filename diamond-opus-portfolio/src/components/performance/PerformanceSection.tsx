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
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          {/* Track */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#E8E5E0"
            strokeWidth="6"
          />
          {/* Fill */}
          <motion.circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={inView ? { strokeDashoffset: circumference * (1 - fraction) } : {}}
            transition={{ duration: 1.5, delay, ease: easing.luxury }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-2xl font-600" style={{ color }}>
            <AnimatedCounter target={value} suffix={suffix} duration={1500} />
          </span>
        </div>
      </div>
      <span className="mt-3 font-sans text-xs uppercase tracking-[0.08em] text-warm-gray-500">
        {label}
      </span>
    </div>
  );
}

const cacheFlow = [
  { label: 'Request', color: '#6B6B6B' },
  { label: 'SHA-256 Key', color: '#6B6B6B' },
  { label: 'Version Check', color: '#B8860B' },
  { label: 'LRU Lookup', color: '#B8860B' },
  { label: 'HIT / MISS', color: '#2D6A4F' },
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
        <div className="mt-12 flex flex-wrap justify-center gap-12">
          <CircularGauge value={95} label="Cache Hit Rate" suffix="%" color="#B8860B" delay={0.2} inView={inView} />
          <CircularGauge value={50} label="Avg Response" suffix="ms" color="#2D6A4F" delay={0.4} inView={inView} />
          <CircularGauge value={85} label="ETag 304 Rate" suffix="%" color="#0078D4" delay={0.6} inView={inView} />
        </div>

        {/* Cache flow */}
        <motion.div
          className="mt-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1, duration: 0.8, ease: easing.luxury }}
        >
          <h3 className="mb-6 text-center font-sans text-xs uppercase tracking-[0.08em] text-warm-gray-400">
            Cache Resolution Flow
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {cacheFlow.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="rounded-md border border-border px-4 py-2">
                  <span className="font-mono text-xs" style={{ color: step.color }}>
                    {step.label}
                  </span>
                </div>
                {i < cacheFlow.length - 1 && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3 text-warm-gray-400" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Invalidation */}
        <motion.div
          className="mx-auto mt-10 max-w-[600px] rounded-lg border border-border bg-pearl p-6 text-center"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 1.4, duration: 0.8 }}
        >
          <p className="font-sans text-sm leading-relaxed text-warm-gray-500">
            <span className="font-500 text-charcoal">Version-keyed invalidation:</span>{' '}
            Consolidator increments{' '}
            <span className="font-mono text-gold">dataset_versions</span>{' '}
            after each successful run. API polls every 30s — version change makes old entries stale.
            No explicit cache flush needed.
          </p>
        </motion.div>
      </div>
    </SectionWrapper>
  );
}
