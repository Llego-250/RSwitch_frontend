import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Participant360Page } from "@/components/participant360/Participant360Page";

// Participant 360 (SRS §8.1). AI alerts and other modules link here as
// /participant?id=<participant id>.
export const Route = createFileRoute("/participant")({
  validateSearch: (search: Record<string, unknown>): { id?: number } => {
    const id = Number(search.id);
    return { id: Number.isInteger(id) && id > 0 ? id : undefined };
  },
  component: ParticipantRoute,
});

function ParticipantRoute() {
  const { id } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <Participant360Page
      selectedId={id}
      onSelect={(next) => navigate({ search: { id: next }, replace: true })}
    />
  );
}
