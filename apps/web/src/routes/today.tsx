import { createFileRoute } from "@tanstack/react-router";
import { listCategories } from "../adapters/http/workspace-api";
import { getToday } from "../adapters/http/planning-api";
import { localDateKey } from "../domain/planning/planning";
import { RoutePending } from "../app/feedback/RoutePending";
import { TodayPage } from "../pages/today/TodayPage";

export const Route = createFileRoute("/today")({
  ssr: false,
  loader: async () => {
    const date = localDateKey();
    const [categories, initial] = await Promise.all([
      listCategories(),
      getToday(date),
    ]);
    return { categories, initial };
  },
  pendingComponent: RoutePending,
  component: TodayRoute,
});

function TodayRoute() {
  return <TodayPage {...Route.useLoaderData()} />;
}
