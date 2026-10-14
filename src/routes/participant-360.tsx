import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Participant360Page } from "@/components/participant360/Participant360Page";

// The sidebar's Participant 360 entry; same page as /participant.
export const Route = createFileRoute("/participant-360")({
  validateSearch: (search: Record<string, unknown>): { id?: number } => {
    const id = Number(search.id);
    return { id: Number.isInteger(id) && id > 0 ? id : undefined };
  },
  component: Participant360Route,
});

function Participant360Route() {
  const { id } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <Participant360Page
      selectedId={id}
      onSelect={(next) => navigate({ search: { id: next }, replace: true })}
    />
  );
}
