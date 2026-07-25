import styles from "./lunara.module.css";

export function AuthHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className={styles.head}>
      <span className={styles.brand}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
        </svg>
        Operasyon Merkezi
      </span>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.sub}>{subtitle}</p>
    </header>
  );
}
