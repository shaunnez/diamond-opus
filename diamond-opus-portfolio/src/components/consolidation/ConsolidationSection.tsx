import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import { easing, systemConstants } from '../../utils/constants';

const phases = [
  {
    title: 'Map',
    subtitle: 'mapRawToDiamond',
    description: 'Raw supplier payloads transformed into canonical diamond records with unified identity',
    icon: (
      <svg viewBox="0 0 48 48" className="h-12 w-12">
        <polygon points="24,4 44,24 24,44 4,24" fill="none" stroke="#9A9590" strokeWidth="1.5" />
        <polygon points="24,12 36,24 24,36 12,24" fill="none" stroke="#9A9590" strokeWidth="0.75" opacity="0.5" />
      </svg>
    ),
    color: '#9A9590',
  },
  {
    title: 'Price',
    subtitle: 'Pricing Engine',
    description: `Base margins (Natural ${systemConstants.NATURAL_BASE_MARGIN}%, Lab ${systemConstants.LAB_BASE_MARGIN}%) + priority-ordered dynamic rule modifiers`,
    icon: (
      <svg viewBox="0 0 48 48" className="h-12 w-12">
        <polygon points="24,4 44,24 24,44 4,24" fill="none" stroke="#B8860B" strokeWidth="1.5" />
        <polygon points="24,12 36,24 24,36 12,24" fill="#B8860B" opacity="0.15" />
        <circle cx="24" cy="24" r="4" fill="#B8860B" opacity="0.4" />
      </svg>
    ),
    color: '#B8860B',
  },
  {
    title: 'Rate',
    subtitle: 'Rating Engine',
    description: '20+ filter dimensions collapse into a configurable 1–10 quality score: shape, color, clarity, cut, carat, table%, depth%, crown angle, pavilion depth, L/W ratio...',
    icon: (
      <svg viewBox="0 0 48 48" className="h-12 w-12">
        <polygon points="24,4 44,24 24,44 4,24" fill="none" stroke="#2D6A4F" strokeWidth="1.5" />
        <polygon points="24,8 40,24 24,40 8,24" fill="#2D6A4F" opacity="0.15" />
        <text x="24" y="28" textAnchor="middle" fontSize="12" fontWeight="600" fill="#2D6A4F">10</text>
      </svg>
    ),
    color: '#2D6A4F',
  },
];

export default function ConsolidationSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="consolidation">
      <div ref={ref}>
        <SectionTitle title="Data Alchemy" subtitle="Three-phase transformation from raw payload to priced, rated diamond" />

        {/* Three phases */}
        <div className="mt-8 grid gap-6 sm:mt-12 sm:gap-8 md:grid-cols-3">
          {phases.map((phase, i) => (
            <motion.div
              key={phase.title}
              className="relative rounded-xl border border-border bg-pearl p-5 text-center sm:p-8"
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.2 + i * 0.2, ease: easing.luxury }}
            >
              {/* Phase number */}
              <div
                className="absolute -top-3 left-6 rounded-full px-3 py-0.5 text-xs font-500"
                style={{
                  backgroundColor: phase.color,
                  color: '#FAF9F7',
                }}
              >
                Phase {i + 1}
              </div>

              {/* Icon */}
              <div className="flex justify-center">{phase.icon}</div>

              {/* Title */}
              <h3
                className="mt-3 font-serif text-xl font-600 sm:mt-4 sm:text-2xl"
                style={{ color: phase.color }}
              >
                {phase.title}
              </h3>

              {/* Subtitle */}
              <p className="mt-1 font-mono text-xs text-warm-gray-400">
                {phase.subtitle}
              </p>

              {/* Description */}
              <p className="mt-3 font-sans text-xs leading-relaxed text-warm-gray-500 sm:mt-4 sm:text-sm">
                {phase.description}
              </p>

              {/* Arrow connector (between cards on desktop) */}
              {i < 2 && (
                <motion.div
                  className="absolute -right-5 top-1/2 z-10 hidden -translate-y-1/2 md:block"
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.8 + i * 0.3 }}
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-gold" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Watermark invariant callout */}
        <motion.div
          className="mt-8 rounded-lg border border-gold/30 bg-charcoal p-4 text-center sm:mt-12 sm:p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.2, duration: 0.8, ease: easing.luxury }}
        >
          <p className="font-sans text-xs text-warm-gray-400 sm:text-sm">
            <span className="font-mono text-gold">INVARIANT</span>
            <span className="mx-2 text-warm-gray-600 sm:mx-3">|</span>
            Watermark advances only after successful consolidation.
            Dataset version increments atomically for cache invalidation.
          </p>
        </motion.div>
      </div>
    </SectionWrapper>
  );
}
