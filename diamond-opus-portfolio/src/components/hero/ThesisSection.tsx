import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { easing, pipelineStats } from '../../utils/constants';
import AnimatedCounter from '../shared/AnimatedCounter';

const stats = [
  { value: pipelineStats.diamonds, suffix: '+', label: 'Diamonds' },
  { value: pipelineStats.microservices, suffix: '', label: 'Microservices' },
  { value: pipelineStats.workers, suffix: '', label: 'Workers' },
  { value: pipelineStats.latencyMs, prefix: '<', suffix: 'ms', label: 'Latency' },
];

export default function ThesisSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      className="relative flex min-h-[60vh] flex-col items-center justify-center bg-cream px-[clamp(20px,5vw,120px)] py-[clamp(80px,12vh,160px)]"
    >
      <div className="mx-auto max-w-[900px] text-center">
        <motion.p
          className="font-serif text-[clamp(24px,3.5vw,48px)] font-400 leading-tight text-charcoal"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease: easing.luxury }}
        >
          What if diamond inventory operated like a financial exchange?
        </motion.p>

        <motion.p
          className="mt-8 font-sans text-lg leading-relaxed text-warm-gray-500"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, delay: 0.2, ease: easing.luxury }}
        >
          Diamond Opus ingests hundreds of thousands of diamonds from global suppliers,
          prices them algorithmically, and serves them in milliseconds.
        </motion.p>

        {/* Stats row */}
        <motion.div
          className="mt-16 grid grid-cols-2 gap-8 md:grid-cols-4"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, delay: 0.4, ease: easing.luxury }}
        >
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center">
              <span className="font-serif text-[clamp(28px,4vw,52px)] font-600 text-charcoal">
                <AnimatedCounter
                  target={stat.value}
                  suffix={stat.suffix}
                  prefix={stat.prefix}
                />
              </span>
              <span className="mt-2 font-sans text-xs uppercase tracking-[0.12em] text-warm-gray-400">
                {stat.label}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
