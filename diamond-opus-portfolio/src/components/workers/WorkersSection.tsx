import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import AnimatedCounter from '../shared/AnimatedCounter';
import { easing } from '../../utils/constants';
import { useWindowSize } from '../../hooks/useWindowSize';

function DiamondDot({ index, cols, inView }: { index: number; cols: number; inView: boolean }) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const delay = 0.5 + (row * cols + col) * 0.008;

  return (
    <motion.div
      className="flex items-center justify-center"
      initial={{ opacity: 0, scale: 0 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.3, delay, ease: easing.smooth }}
    >
      <svg viewBox="0 0 12 12" className="h-2 w-2 sm:h-2.5 sm:w-2.5">
        <motion.polygon
          points="6,0 12,6 6,12 0,6"
          fill="#B8860B"
          initial={{ opacity: 0.3 }}
          animate={inView ? { opacity: [0.3, 1, 0.7] } : {}}
          transition={{ duration: 1, delay: delay + 0.2 }}
        />
      </svg>
    </motion.div>
  );
}

const continuationSteps = ['Receive', 'Process', 'Upsert', 'Enqueue'];

export default function WorkersSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const { width } = useWindowSize();

  // Responsive grid: 10x10 on mobile, 20x10 on desktop
  const cols = width < 640 ? 10 : 20;
  const rows = 10;
  const total = cols * rows;

  return (
    <SectionWrapper id="workers" dark>
      <div ref={ref}>
        <SectionTitle title="Zero to Two Hundred" light subtitle="KEDA-driven elastic scaling from Azure Service Bus queue depth" />

        {/* Worker grid */}
        <div className="mx-auto mt-8 max-w-[600px] sm:mt-12">
          <div
            className="grid gap-1 sm:gap-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {Array.from({ length: total }, (_, i) => (
              <DiamondDot key={i} index={i} cols={cols} inView={inView} />
            ))}
          </div>

          {/* Counter */}
          <motion.div
            className="mt-6 text-center sm:mt-8"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 2, duration: 0.8 }}
          >
            <span className="font-serif text-[clamp(32px,5vw,64px)] font-600 text-gold">
              <AnimatedCounter target={200} duration={2500} />
            </span>
            <span className="ml-2 font-sans text-xs uppercase tracking-[0.1em] text-warm-gray-400 sm:ml-3 sm:text-sm sm:tracking-[0.12em]">
              concurrent workers
            </span>
          </motion.div>
        </div>

        {/* Continuation pattern */}
        <motion.div
          className="mx-auto mt-10 max-w-[700px] sm:mt-16"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 2.5, duration: 0.8, ease: easing.luxury }}
        >
          <h3 className="mb-4 text-center font-sans text-[10px] uppercase tracking-[0.12em] text-warm-gray-400 sm:mb-6 sm:text-xs">
            Continuation Pattern
          </h3>

          {/* Mobile: 2x2 grid. Desktop: horizontal row */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-3">
            {continuationSteps.map((step, i) => (
              <div key={step} className="flex items-center justify-center gap-2 sm:gap-3">
                <div className="w-full rounded-md border border-gold/30 px-3 py-2 text-center sm:w-auto sm:px-4">
                  <span className="font-sans text-[11px] text-cream sm:text-xs">{step}</span>
                </div>
                {/* Arrow only on desktop between items */}
                {i < 3 && (
                  <svg viewBox="0 0 24 24" className="hidden h-4 w-4 shrink-0 text-gold sm:block" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 text-center font-sans text-xs text-warm-gray-400 sm:mt-6 sm:text-sm">
            Each worker processes exactly one page per message. Idempotency relies on
            partition progress offsets — no duplicate processing, no missed records.
          </p>
        </motion.div>
      </div>
    </SectionWrapper>
  );
}
