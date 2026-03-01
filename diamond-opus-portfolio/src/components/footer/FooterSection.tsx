import { motion } from 'framer-motion';
import { easing } from '../../utils/constants';
import GoldButton from '../shared/GoldButton';

export default function FooterSection() {
  return (
    <footer className="flex min-h-[40vh] flex-col items-center justify-center bg-charcoal px-5 py-16 sm:min-h-[50vh] sm:px-8 sm:py-24">
      {/* Diamond icon */}
      <motion.svg
        viewBox="0 0 32 32"
        className="mb-8 h-6 w-6 text-gold"
        initial={{ opacity: 0, scale: 0 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: easing.luxury }}
      >
        <polygon points="16,2 28,12 16,30 4,12" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="16,2 10,12 16,30" fill="currentColor" opacity="0.3" />
      </motion.svg>

      {/* Name */}
      <motion.h2
        className="font-serif text-[clamp(36px,8vw,120px)] font-600 leading-none tracking-[0.12em] text-cream sm:tracking-[0.15em]"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: easing.luxury }}
      >
        SHAUN
      </motion.h2>

      {/* CV button */}
      <motion.div
        className="mt-8 sm:mt-10"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        <GoldButton href="#">View CV</GoldButton>
      </motion.div>

      {/* Copyright */}
      <motion.p
        className="mt-10 font-sans text-[10px] text-warm-gray-600 sm:mt-16 sm:text-xs"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.8, duration: 0.8 }}
      >
        Diamond Opus — Enterprise Diamond Platform
      </motion.p>

      {/* Bottom line */}
      <motion.div
        className="mt-8 h-px w-32 bg-gold/30"
        initial={{ width: 0 }}
        whileInView={{ width: 128 }}
        viewport={{ once: true }}
        transition={{ delay: 1, duration: 1.2, ease: easing.luxury }}
      />
    </footer>
  );
}
