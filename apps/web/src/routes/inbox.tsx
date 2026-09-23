import { createFileRoute } from "@tanstack/react-router";
import { listCategories } from "../adapters/http/workspace-api";
import { getInbox } from "../adapters/http/planning-api";
import { RoutePending } from "../pages/_shared/RoutePending";
import { InboxPage } from "../pages/inbox/InboxPage";

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
  return <InboxPage {...Route.useLoaderData()} />;
}
