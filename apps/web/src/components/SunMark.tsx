import styles from './SunMark.module.css';

/** The striped sun on its horizon line (visual-identity R1, R7). */
export function SunMark({ size = 28 }: { size?: number }) {
  return (
    <span className={styles.mark} style={{ width: size, height: size * 0.62 }} aria-hidden="true">
      <span className={styles.sun} />
      <span className={styles.horizon} />
    </span>
  );
}

export function Wordmark() {
  return (
    <span className={styles.wordmark}>
      <SunMark />
      <span>Simmery</span>
    </span>
  );
}

/** The recipe hero: the sun rising out of the sky gradient. */
export function SkyHero({ children }: { children?: React.ReactNode }) {
  return (
    <div className={styles.hero}>
      <span className={styles.heroSun} aria-hidden="true" />
      <span className={styles.heroGround} aria-hidden="true" />
      {children}
    </div>
  );
}
