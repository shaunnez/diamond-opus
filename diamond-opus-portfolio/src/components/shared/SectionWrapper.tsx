import { useRef, type ReactNode } from 'react';
import { motion, useInView } from 'framer-motion';
import { easing } from '../../utils/constants';

interface SectionWrapperProps {
  children: ReactNode;
  className?: string;
  id?: string;
  dark?: boolean;
}

export default function SectionWrapper({ children, className = '', id, dark }: SectionWrapperProps) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.section
      ref={ref}
      id={id}
      className={`relative px-[clamp(20px,5vw,120px)] py-[clamp(80px,12vh,160px)] ${
        dark ? 'bg-charcoal text-cream' : 'bg-cream text-charcoal'
      } ${className}`}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.8, ease: easing.luxury }}
    >
      <div className="mx-auto max-w-[1200px]">{children}</div>
    </motion.section>
  );
}
