"use client";

import styles from "./lunara.module.css";

/**
 * Gönder düğmesi küçük bir kapıdır: gönderimde kapı açılır, çöp adam içinden
 * geçer, kapı kapanır ve düğme yeşil onay işaretine yerleşir.
 */
export type DoorPhase = "idle" | "open" | "walk" | "out" | "close" | "success";

const PHASE_CLASSES: Record<DoorPhase, readonly string[]> = {
  idle: [],
  open: ["dooropen"],
  walk: ["dooropen", "walking"],
  out: ["dooropen", "walking", "out"],
  close: ["out"], // kapı kapanır, adam eşiğin ötesinde kalır
  success: ["out", "isSuccess"],
};

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Kapı dizisini oynatır (~1,15 sn). Sunucu isteğiyle eşzamanlı çalıştırılmak
 * üzere tasarlandı: animasyon beklerken istek de yolda olur.
 */
export async function playDoorSequence(
  setPhase: (phase: DoorPhase) => void
): Promise<void> {
  if (prefersReducedMotion()) {
    setPhase("open");
    await wait(200);
    setPhase("close");
    return;
  }
  setPhase("open");
  await wait(300); // kapı açılır
  setPhase("walk");
  await wait(60); // bacaklar başlar
  setPhase("out");
  await wait(560); // eşikten geçiş
  setPhase("close");
  await wait(220); // kapı arkasından kapanır
}

export function DoorButton({
  phase,
  label,
}: {
  phase: DoorPhase;
  label: string;
}) {
  const className = [styles.btn, ...PHASE_CLASSES[phase].map((k) => styles[k])].join(" ");

  return (
    <button type="submit" className={className} disabled={phase !== "idle"}>
      <span className={styles.btnLabel}>{label}</span>

      <span className={styles.dooric} aria-hidden="true">
        <span className={styles.doorFrame}>
          <span className={styles.doorGlow} />
        </span>
        <span className={styles.doorPanel}>
          <span className={styles.doorHandle} />
        </span>
        <span className={styles.doorPerson}>
          <svg
            viewBox="0 0 26 44"
            width="17"
            height="29"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <g className={styles.person}>
              <g className={styles.personBob}>
                <g className={`${styles.leg} ${styles.legBack}`}>
                  <line x1="13" y1="25" x2="13" y2="34" />
                  <g className={styles.shin}>
                    <line x1="13" y1="34" x2="13" y2="42.5" />
                  </g>
                </g>
                <g className={`${styles.arm} ${styles.armBack}`}>
                  <line x1="13" y1="14.5" x2="13" y2="24" />
                </g>
                <circle cx="13" cy="7" r="4" fill="currentColor" stroke="none" />
                <line x1="13" y1="11" x2="13" y2="25.5" />
                <g className={`${styles.leg} ${styles.legFront}`}>
                  <line x1="13" y1="25" x2="13" y2="34" />
                  <g className={styles.shin}>
                    <line x1="13" y1="34" x2="13" y2="42.5" />
                  </g>
                </g>
                <g className={`${styles.arm} ${styles.armFront}`}>
                  <line x1="13" y1="14.5" x2="13" y2="24" />
                </g>
              </g>
            </g>
          </svg>
        </span>
      </span>

      <svg
        className={styles.btnCheck}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0a1024"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </button>
  );
}
