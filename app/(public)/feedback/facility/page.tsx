import { FeedbackPage } from "../FeedbackPage";

export const metadata = { title: "Event feedback" };
export const dynamic = "force-dynamic";

export default async function FacilityFeedbackPage(props: PageProps<"/feedback/facility">) {
  const sp = await props.searchParams;
  return <FeedbackPage kind="CLIENT" refToken={typeof sp.ref === "string" ? sp.ref : undefined} />;
}
