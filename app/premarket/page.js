import Link from "next/link";
import { getLatestPremarketBrief, listPremarketBriefDates } from "@/lib/premarket-briefs";
import styles from "./premarket.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Premarket Brief",
  description: "Private premarket briefing view.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PremarketPage() {
  const brief = await getLatestPremarketBrief();
  const dates = await listPremarketBriefDates();

  if (!brief) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.emptyCard}>
            <h1 className={styles.title}>Premarket Brief</h1>
            <p className={styles.lede}>No published brief is available yet. Run the `premarket-ai` build to publish one into this site.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Hidden Route</p>
          <h1 className={styles.title}>Premarket Brief</h1>
          <p className={styles.lede}>This route is intentionally unlinked from the public site navigation. Keep the URL directly and share only if you mean to.</p>
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
            <h2 className={styles.archiveTitle}>Recent Briefs</h2>
            <div className={styles.archiveList}>
              {dates
                .filter((date) => date !== brief.date)
                .slice(0, 12)
                .map((date) => (
                  <Link key={date} href={`/premarket/${date}`} className={styles.archiveLink}>
                    {date}
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
