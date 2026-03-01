import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import AnimatedCounter from '../shared/AnimatedCounter';
import { easing } from '../../utils/constants';

const GRID_COLS = 20;
const GRID_ROWS = 10;
const TOTAL = GRID_COLS * GRID_ROWS;

function DiamondDot({ index, inView }: { index: number; inView: boolean }) {
  const row = Math.floor(index / GRID_COLS);
  const col = index % GRID_COLS;
  const delay = 0.5 + (row * GRID_COLS + col) * 0.008;

  return (
    <motion.div
      className="flex items-center justify-center"
      initial={{ opacity: 0, scale: 0 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.3, delay, ease: easing.smooth }}
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
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

export default function WorkersSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="workers" dark>
      <div ref={ref}>
        <SectionTitle title="Zero to Two Hundred" light subtitle="KEDA-driven elastic scaling from Azure Service Bus queue depth" />

        {/* Worker grid */}
        <div className="mx-auto mt-12 max-w-[600px]">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}
          >
            {Array.from({ length: TOTAL }, (_, i) => (
              <DiamondDot key={i} index={i} inView={inView} />
            ))}
          </div>

          {/* Counter */}
          <motion.div
            className="mt-8 text-center"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 2, duration: 0.8 }}
          >
            <span className="font-serif text-[clamp(36px,5vw,64px)] font-600 text-gold">
              <AnimatedCounter target={200} duration={2500} />
            </span>
            <span className="ml-3 font-sans text-sm uppercase tracking-[0.12em] text-warm-gray-400">
              concurrent workers
            </span>
          </motion.div>
        </div>

        {/* Continuation pattern */}
        <motion.div
          className="mx-auto mt-16 max-w-[700px]"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 2.5, duration: 0.8, ease: easing.luxury }}
        >
          <h3 className="mb-6 text-center font-sans text-xs uppercase tracking-[0.12em] text-warm-gray-400">
            Continuation Pattern
          </h3>

          <div className="flex items-center justify-center gap-3">
            {['Receive Message', 'Process Page', 'Upsert Raw', 'Enqueue Next'].map(
              (step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="rounded-md border border-gold/30 px-4 py-2 text-center">
                    <span className="font-sans text-xs text-cream">{step}</span>
                  </div>
                  {i < 3 && (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-gold" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              ),
            )}
          </div>

          <p className="mt-6 text-center font-sans text-sm text-warm-gray-400">
            Each worker processes exactly one page per message. Idempotency relies on
            partition progress offsets — no duplicate processing, no missed records.
          </p>
        </motion.div>
      </div>
    </SectionWrapper>
  );
}
