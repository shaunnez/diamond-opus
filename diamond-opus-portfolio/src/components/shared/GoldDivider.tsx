import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { easing } from '../../utils/constants';

interface GoldDividerProps {
  withDiamond?: boolean;
}

export default function GoldDivider({ withDiamond = false }: GoldDividerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });

  return (
    <div ref={ref} className="flex items-center justify-center py-8">
      <motion.div
        className="h-px bg-gold"
        initial={{ width: 0 }}
        animate={inView ? { width: '40%' } : {}}
        transition={{ duration: 1.2, ease: easing.luxury }}
      />
      {withDiamond && (
        <motion.svg
          viewBox="0 0 16 16"
          className="mx-3 h-3 w-3 text-gold"
          initial={{ opacity: 0, scale: 0 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <polygon points="8,0 16,8 8,16 0,8" fill="currentColor" />
        </motion.svg>
      )}
      <motion.div
        className="h-px bg-gold"
        initial={{ width: 0 }}
        animate={inView ? { width: '40%' } : {}}
        transition={{ duration: 1.2, ease: easing.luxury }}
      />
    </div>
  );
}
