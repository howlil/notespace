import { createFileRoute } from "@tanstack/react-router";
import { listCategories } from "../domain/project/api";
import { getInbox } from "../domain/planning/api";
import { RoutePending } from "../components/feedback/RoutePending";
import { Inbox } from "../features/inbox/Inbox";

export const Route = createFileRoute("/inbox")({
  ssr: false,
  loader: async () => {
    const [categories, initial] = await Promise.all([
      listCategories(),
      getInbox(),
    ]);
    return { categories, initial };
  },
  pendingComponent: RoutePending,
  component: InboxRoute,
});

function InboxRoute() {
  return <Inbox {...Route.useLoaderData()} />;
}
