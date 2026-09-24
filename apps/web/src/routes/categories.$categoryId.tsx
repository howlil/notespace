import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/categories/$categoryId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/",
      search: { category: params.categoryId },
      replace: true,
    });
  },
});
