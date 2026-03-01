import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { easing } from '../../utils/constants';

interface CodeBlockProps {
  code: string;
  className?: string;
}

export default function CodeBlock({ code, className = '' }: CodeBlockProps) {
  const ref = useRef<HTMLPreElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <motion.pre
      ref={ref}
      className={`overflow-x-auto rounded-lg border border-border bg-charcoal p-6 font-mono text-sm leading-relaxed text-warm-gray-400 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: easing.luxury }}
    >
      <code>{code}</code>
    </motion.pre>
  );
}
