"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import styles from "./lunara.module.css";

/**
 * Giriş/doğrulama sayfalarının arka planı: ay ışığındaki çöl sahnesi ve
 * üzerinde duran cam kart. Derinlik (parallax + eğim + parlama) ve atmosfer
 * (yıldız, yıldız tozu, kayan yıldız, rüzgârlı kum) tek bir rAF döngüsüyle
 * sürülür. Kart içeriğini `children` olarak alır.
 */
export function LunaraScene({ children }: { children: React.ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const sandRef = useRef<HTMLDivElement>(null);
  const duneRef = useRef<HTMLImageElement>(null);

  // Kademeli giriş — ilk boyamadan sonra tetiklenir ki geçiş görünsün.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const id = requestAnimationFrame(() => stage.classList.add(styles.isIn));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const cleanups: Array<() => void> = [];

    // Canlı imleç konumu (sahne koordinatı) — toz bunun etrafından ayrılır.
    let curX = -9999;
    let curY = -9999;

    /* ---------- gökyüzündeki titreşen yıldızlar ---------- */
    const starfield = starsRef.current;
    if (starfield) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 150; i++) {
        const st = document.createElement("span");
        st.className = styles.star;
        const size = 1 + Math.random() * 1.9;
        st.style.width = st.style.height = `${size}px`;
        st.style.left = `${Math.random() * 100}%`;
        st.style.top = `${Math.random() * 68}%`;
        st.style.setProperty("--tw", `${2.2 + Math.random() * 4.5}s`);
        st.style.animationDelay = `${-Math.random() * 7}s`;
        frag.appendChild(st);
      }
      starfield.appendChild(frag);
      cleanups.push(() => starfield.replaceChildren());
    }

    /* ---------- kayan yıldızlar ---------- */
    const sky = skyRef.current;
    if (sky) {
      let timer = 0;
      const shoot = () => {
        const s = document.createElement("span");
        s.className = styles.streak;
        s.style.setProperty("--ang", `${16 + Math.random() * 14}deg`);
        s.style.setProperty("--len", `${140 + Math.random() * 160}px`);
        s.style.setProperty("--travel", `${44 + Math.random() * 34}vw`);
        s.style.setProperty("--sdur", `${0.9 + Math.random() * 0.7}s`);
        s.style.left = `${Math.random() * 45}%`;
        s.style.top = `${4 + Math.random() * 34}%`;
        s.addEventListener("animationend", () => s.remove());
        sky.appendChild(s);
      };
      const schedule = () => {
        shoot();
        if (Math.random() < 0.3) shoot(); // ara sıra çift kayma
        timer = window.setTimeout(schedule, 1100 + Math.random() * 2200);
      };
      timer = window.setTimeout(schedule, 600);
      cleanups.push(() => {
        clearTimeout(timer);
        sky.replaceChildren();
      });
    }

    /* ---------- yıldız tozu: tek canvas, yüzlerce parçacık ----------
       Yüksek parçacık sayısı için doğru yaklaşım: tek bir canvas ve önceden
       çizilmiş bir hale sprite'ını toplamalı harmanlamayla damgalamak.
       Yüzlerce animasyonlu DOM düğümünden çok daha ucuz. */
    type Particle = {
      x: number; y: number; z: number;
      vx: number; vy: number;
      ph: number; tw: number; base: number;
    };
    let renderDust: ((now: number, ax: number, ay: number) => void) | null = null;

    const canvas = dustRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (canvas && ctx) {
      const parts: Particle[] = [];
      let W = 0;
      let H = 0;
      let last = 0;

      // yumuşak hale sprite'ı, bir kez çizilir
      const sprite = document.createElement("canvas");
      const R = 16;
      sprite.width = sprite.height = R * 2;
      const sctx = sprite.getContext("2d");
      if (sctx) {
        const grad = sctx.createRadialGradient(R, R, 0, R, R, R);
        grad.addColorStop(0, "rgba(238, 244, 255, 1)");
        grad.addColorStop(0.4, "rgba(190, 212, 255, 0.5)");
        grad.addColorStop(1, "rgba(170, 200, 255, 0)");
        sctx.fillStyle = grad;
        sctx.beginPath();
        sctx.arc(R, R, R, 0, Math.PI * 2);
        sctx.fill();
      }

      const spawn = (): Particle => ({
        x: Math.random() * W,
        y: Math.random() * H,
        z: 0.35 + Math.random() * 0.65, // derinlik → boyut / hız / parallax
        vx: (Math.random() * 2 - 1) * 6, // px/sn sürüklenme
        vy: (Math.random() * 2 - 1) * 5 - 5, // hafif yukarı eğilim
        ph: Math.random() * Math.PI * 2,
        tw: 0.5 + Math.random() * 1.6,
        base: 0.22 + Math.random() * 0.6,
      });

      const resize = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const target = Math.min(700, Math.round((W * H) / 2600)); // yoğunluk, üst sınırlı
        while (parts.length < target) parts.push(spawn());
        parts.length = Math.min(parts.length, target);
      };
      resize();
      addEventListener("resize", resize, { passive: true });
      cleanups.push(() => removeEventListener("resize", resize));

      const CURSOR_R = 150;
      const CURSOR_R2 = CURSOR_R * CURSOR_R;
      renderDust = (now, ax, ay) => {
        const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
        last = now;
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = "lighter";
        for (const p of parts) {
          p.x += p.vx * p.z * dt;
          p.y += p.vy * p.z * dt;
          if (p.x < -24) p.x = W + 24;
          else if (p.x > W + 24) p.x = -24;
          if (p.y < -24) p.y = H + 24;
          else if (p.y > H + 24) p.y = -24;
          p.ph += p.tw * dt;

          let x = p.x + ax * p.z * 26; // parallax bağlantısı
          let y = p.y + ay * p.z * 26;
          let a = p.base * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.ph)));

          // imleç tozu aralar — yakındaki parçacıklar daha sert itilir, parlar
          const dx = x - curX;
          const dy = y - curY;
          const d2 = dx * dx + dy * dy;
          if (d2 < CURSOR_R2) {
            const d = Math.sqrt(d2) || 1;
            const f = 1 - d / CURSOR_R;
            const push = f * f * 46 * (0.5 + p.z);
            x += (dx / d) * push;
            y += (dy / d) * push;
            a = Math.min(1, a + f * 0.5);
          }

          const sz = 1.1 + p.z * 4.2;
          ctx.globalAlpha = a;
          ctx.drawImage(sprite, x - sz, y - sz, sz * 2, sz * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      };
    }

    /* ---------- imleç: parallax, kart eğimi, cam parlaması ---------- */
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const layers: Array<[HTMLElement | null, number]> = [
      [bgRef.current, 0.02],
      [sandRef.current, 0.08],
      [duneRef.current, 0.11],
    ];

    let tx = 0, ty = 0, cx = 0, cy = 0; // parallax hedefi / mevcut
    let trx = 0, tryy = 0, crx = 0, cryy = 0; // eğim hedefi / mevcut

    if (fine) {
      const onMove = (e: PointerEvent) => {
        curX = e.clientX;
        curY = e.clientY;
        const nx = e.clientX / innerWidth - 0.5; // -0.5 .. 0.5
        const ny = e.clientY / innerHeight - 0.5;
        tx = nx;
        ty = ny;
        trx = -ny * 7; // öne/arkaya eğim
        tryy = nx * 9; // sağa/sola eğim
        const card = cardRef.current;
        if (card) {
          const r = card.getBoundingClientRect();
          card.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
          card.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
        }
      };
      const onLeave = () => {
        tx = ty = trx = tryy = 0;
        curX = curY = -9999;
      };
      addEventListener("pointermove", onMove, { passive: true });
      addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        removeEventListener("pointermove", onMove);
        removeEventListener("pointerleave", onLeave);
      });
    }

    /* ---------- tek rAF döngüsü ---------- */
    // İmleç dursa bile sahne yavaşça nefes almayı sürdürür.
    let frame = 0;
    const tick = (now: number) => {
      const t = now * 0.001;
      const ambX = Math.sin(t * 0.34) * 0.55 + Math.sin(t * 0.13) * 0.3;
      const ambY = Math.cos(t * 0.26) * 0.42;

      if (fine) {
        cx += (tx - cx) * 0.06;
        cy += (ty - cy) * 0.06;
        crx += (trx - crx) * 0.08;
        cryy += (tryy - cryy) * 0.08;
        for (const [el, depth] of layers) {
          if (!el) continue;
          el.style.setProperty("--px", `${-cx * depth * 100 + ambX * depth * 34}px`);
          el.style.setProperty("--py", `${-cy * depth * 100 + ambY * depth * 34}px`);
        }
        const card = cardRef.current;
        if (card) {
          card.style.setProperty("--rx", `${crx.toFixed(2)}deg`);
          card.style.setProperty("--ry", `${cryy.toFixed(2)}deg`);
        }
      }

      renderDust?.(now, cx + ambX * 0.5, cy + ambY * 0.5);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    cleanups.push(() => cancelAnimationFrame(frame));

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <div className={styles.scene} data-lunara>
      {/* en derin düzlem: ay ışığındaki çöl fotoğrafı, yavaş kayma ile */}
      <div className={styles.bg} aria-hidden="true" ref={bgRef}>
        <Image
          src="/lunara/bg.jpg"
          alt=""
          width={1600}
          height={786}
          loading="eager"
          fetchPriority="high"
          className={styles.bgImg}
        />
      </div>

      {/* titreşen yıldızlar + ayın etrafındaki yumuşak hale */}
      <div className={styles.stars} aria-hidden="true" ref={starsRef} />
      <div className={styles.moonglow} aria-hidden="true" />

      {/* sırtı geçen deve kervanı */}
      {/* unoptimized: alfa kanallı WebP; optimizasyon WebP desteklemeyen
          istemcilerde JPEG'e düşüp şeffaflığı yok eder, kazanç ise ihmal edilebilir */}
      <Image
        src="/lunara/caravan.webp"
        alt=""
        aria-hidden="true"
        width={1100}
        height={447}
        loading="eager"
        unoptimized
        className={styles.caravan}
      />

      {/* periyodik kayan yıldızlar */}
      <div className={styles.shooting} aria-hidden="true" ref={skyRef} />

      {/* sürüklenen yıldız tozu */}
      <canvas className={styles.dust} aria-hidden="true" ref={dustRef} />

      {/* aydınlık tepeden kalkan rüzgârlı kum */}
      <div className={styles.sand} aria-hidden="true" ref={sandRef}>
        <span className={`${styles.wisp} ${styles.w1}`} />
        <span className={`${styles.wisp} ${styles.w2}`} />
        <span className={`${styles.wisp} ${styles.w3}`} />
      </div>

      {/* en öndeki kum tepesi */}
      <Image
        src="/lunara/dune.webp"
        alt=""
        aria-hidden="true"
        width={2000}
        height={319}
        loading="eager"
        unoptimized
        className={styles.dune}
        ref={duneRef}
      />

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
