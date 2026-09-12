/**
 * Local-dev helper: print the live secure links from the email log (dev mode stores the
 * rendered text because no email provider is configured). Never useful in production,
 * where the provider is configured and no previews are stored.
 */
import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const rows = await prisma.notificationLog.findMany({ where: { payload: { not: undefined } }, orderBy: { createdAt: "desc" }, take: 100 });
  const links: { template: string; to: string; url: string }[] = [];
  for (const r of rows) {
    const text = (r.payload as { text?: string } | null)?.text ?? "";
    const m = text.match(/https?:\/\/\S+\/(respond\/[A-Za-z0-9_-]+|feedback\/(?:facility|musician)\?ref=[A-Za-z0-9_-]+)/);
    if (m) links.push({ template: r.templateKey, to: r.recipient, url: m[0] });
  }
  console.log(JSON.stringify(links, null, 2));
}

main().finally(() => prisma.$disconnect());
