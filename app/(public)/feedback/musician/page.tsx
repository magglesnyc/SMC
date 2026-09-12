import { FeedbackPage } from "../FeedbackPage";

export const metadata = { title: "Venue feedback" };
export const dynamic = "force-dynamic";

export default async function MusicianFeedbackPage(props: PageProps<"/feedback/musician">) {
  const sp = await props.searchParams;
  return <FeedbackPage kind="MUSICIAN" refToken={typeof sp.ref === "string" ? sp.ref : undefined} />;
}
