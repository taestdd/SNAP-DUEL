"use client";

import { useRouter } from "next/navigation";
import styles from "./MainMenu.module.css";

const MENU_ITEMS = [
  { label: "AI 대전",     href: "/game",   disabled: false },
  { label: "온라인 대전", href: "/online", disabled: false },
  { label: "랭크 대전",   href: null,      disabled: true  },
  { label: "덱 빌더",     href: null,      disabled: true  },
];

export default function MainMenu() {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Snap Duel</h1>
          <span className={styles.subtitle}>Card Fighting Game</span>
        </div>

        <nav className={styles.menuList}>
          {MENU_ITEMS.map(({ label, href, disabled }) => (
            <button
              key={label}
              type="button"
              className={styles.menuBtn}
              disabled={disabled}
              onClick={() => href && router.push(href)}
            >
              {label}
              {disabled && <span className={styles.soon}>준비 중</span>}
            </button>
          ))}
        </nav>

        <a
          href="/admin"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.adminLink}
        >
          ⚙ 카드 에디터
        </a>
      </div>
    </div>
  );
}
