import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { easing } from '../../utils/constants';

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  light?: boolean;
}

export default function SectionTitle({ title, subtitle, light }: SectionTitleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="mb-16 text-center">
      <motion.h2
        className={`font-serif text-[clamp(36px,5vw,72px)] font-600 leading-tight tracking-[0.02em] ${
          light ? 'text-cream' : 'text-charcoal'
        }`}
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: easing.luxury }}
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          className={`mt-4 font-sans text-lg tracking-wide ${
            light ? 'text-warm-gray-400' : 'text-warm-gray-500'
          }`}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.15, ease: easing.luxury }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
