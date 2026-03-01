import { Suspense, lazy, useState, useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { easing } from '../../utils/constants';
import { useWebGLSupport } from '../../hooks/useWebGLSupport';
import { useWindowSize } from '../../hooks/useWindowSize';
import DiamondFallback from './DiamondFallback';

const DiamondScene = lazy(() => import('./DiamondScene'));

function ErrorBoundary({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handler = (e: ErrorEvent) => {
      if (e.message?.includes('WebGL') || e.message?.includes('THREE')) {
        setHasError(true);
      }
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  if (hasError) return <>{fallback}</>;
  return <>{children}</>;
}

export default function HeroSection() {
  const webglSupported = useWebGLSupport();
  const { width } = useWindowSize();
  const isMobile = width < 640;
  const use3D = webglSupported && !isMobile;

  const nameLetters = 'SHAUN'.split('');

  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-charcoal px-4">
      {/* Radial gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 40%, #1a1a1a 0%, #0d0d0d 70%)',
        }}
      />

      {/* Diamond */}
      <motion.div
        className="relative z-10 h-40 w-40 sm:h-64 sm:w-64"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5, ease: easing.luxury }}
      >
        {use3D ? (
          <ErrorBoundary fallback={<DiamondFallback />}>
            <Suspense fallback={<DiamondFallback />}>
              <DiamondScene />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <DiamondFallback />
        )}
      </motion.div>

      {/* Name */}
      <div className="relative z-10 mt-6 flex overflow-hidden sm:mt-8">
        {nameLetters.map((letter, i) => (
          <motion.span
            key={i}
            className="font-serif text-[clamp(48px,12vw,180px)] font-600 leading-none tracking-[0.12em] text-cream sm:tracking-[0.15em]"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.8 + i * 0.1,
              ease: easing.luxury,
            }}
          >
            {letter}
          </motion.span>
        ))}
      </div>

      {/* Subtitle */}
      <motion.p
        className="relative z-10 mt-3 font-sans text-xs uppercase tracking-[0.12em] text-warm-gray-400 sm:mt-4 sm:text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.6 }}
      >
        Software Architect
      </motion.p>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 z-10 flex flex-col items-center sm:bottom-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5, duration: 1 }}
      >
        <motion.div
          className="h-8 w-px bg-gold sm:h-12"
          animate={{ scaleY: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: 'top' }}
        />
      </motion.div>
    </section>
  );
}
