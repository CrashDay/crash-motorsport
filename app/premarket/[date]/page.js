import Link from "next/link";
import { notFound } from "next/navigation";
import { getPremarketBrief, listPremarketBriefDates } from "@/lib/premarket-briefs";
import styles from "../premarket.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { date } = await params;
  return {
    title: `Premarket Brief ${date}`,
    description: "Private dated premarket briefing view.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function PremarketDatePage({ params }) {
  const { date } = await params;
  const brief = await getPremarketBrief(date);
  if (!brief) notFound();

  const dates = await listPremarketBriefDates();

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Archive View</p>
          <h1 className={styles.title}>Premarket Brief</h1>
          <p className={styles.lede}>Dated snapshot for {brief.date}. This page is intentionally not linked from the public navigation.</p>
          <div className={styles.metaRow}>
            <span className={styles.metaPill}>Session: {brief.date}</span>
            <span className={styles.metaPill}>Published: {formatDateTime(brief.publishedAt)}</span>
          </div>
        </section>

        <section className={styles.briefCard}>
          <div className={styles.briefing} dangerouslySetInnerHTML={{ __html: brief.html }} />
        </section>

        {dates.length > 1 ? (
          <section className={styles.archive}>
            <h2 className={styles.archiveTitle}>Other Briefs</h2>
            <div className={styles.archiveList}>
              {dates
                .filter((item) => item !== brief.date)
                .slice(0, 12)
                .map((item) => (
                  <Link key={item} href={`/premarket/${item}`} className={styles.archiveLink}>
                    {item}
                  </Link>
                ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
