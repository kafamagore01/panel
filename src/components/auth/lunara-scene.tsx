"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import styles from "./lunara.module.css";
import sceneStyles from "./aurora-scene.module.css";

/**
 * Giriş ve doğrulama ekranlarının hareketli aurora sahnesi.
 * Arka plan, atmosfer katmanları ve kart parallax'ı tek bir rAF döngüsünde
 * yumuşatılır; görsel hareketler azaltılmış hareket tercihine saygı duyar.
 */
export function LunaraScene({ children }: { children: React.ReactNode }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const frame = requestAnimationFrame(() => stage.classList.add(styles.isIn));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;

    const onPointerMove = (event: PointerEvent) => {
      targetX = event.clientX / innerWidth - 0.5;
      targetY = event.clientY / innerHeight - 0.5;

      const card = cardRef.current;
      if (!card) return;

      const bounds = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
      card.style.setProperty("--my", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
    };

    const onPointerLeave = () => {
      targetX = 0;
      targetY = 0;
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.045;
      currentY += (targetY - currentY) * 0.045;

      scene.style.setProperty("--bg-x", `${(-currentX * 18).toFixed(2)}px`);
      scene.style.setProperty("--bg-y", `${(-currentY * 12).toFixed(2)}px`);
      scene.style.setProperty("--fx-x", `${(-currentX * 34).toFixed(2)}px`);
      scene.style.setProperty("--fx-y", `${(-currentY * 20).toFixed(2)}px`);

      const card = cardRef.current;
      if (card) {
        card.style.setProperty("--rx", `${(-currentY * 4.5).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${(currentX * 5.5).toFixed(2)}deg`);
      }

      frame = requestAnimationFrame(tick);
    };

    if (finePointer) {
      addEventListener("pointermove", onPointerMove, { passive: true });
      addEventListener("pointerleave", onPointerLeave);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", onPointerMove);
      removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div
      className={`${styles.scene} ${sceneStyles.scene}`}
      data-aurora-scene
      ref={sceneRef}
    >
      <div className={sceneStyles.backdrop} aria-hidden="true">
        <Image
          src="/aurora/aurora-lake.png"
          alt=""
          fill
          preload
          sizes="100vw"
          className={sceneStyles.backdropImage}
        />
      </div>

      <div className={sceneStyles.aurora} aria-hidden="true">
        <span className={`${sceneStyles.ribbon} ${sceneStyles.ribbonOne}`} />
        <span className={`${sceneStyles.ribbon} ${sceneStyles.ribbonTwo}`} />
        <span className={`${sceneStyles.ribbon} ${sceneStyles.ribbonThree}`} />
      </div>

      <div className={sceneStyles.stars} aria-hidden="true" />

      <div className={sceneStyles.mist} aria-hidden="true">
        <span className={`${sceneStyles.mistBand} ${sceneStyles.mistOne}`} />
        <span className={`${sceneStyles.mistBand} ${sceneStyles.mistTwo}`} />
        <span className={`${sceneStyles.mistBand} ${sceneStyles.mistThree}`} />
      </div>

      <div className={sceneStyles.waterLight} aria-hidden="true" />
      <div className={sceneStyles.floaters} aria-hidden="true" />

      <div className={styles.stage} ref={stageRef}>
        <div className={styles.wrap}>
          <div className={styles.card} ref={cardRef}>
            <span className={styles.sheen} aria-hidden="true" />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
