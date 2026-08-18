import { createFileRoute } from "@tanstack/react-router";
import { Participant360 } from "@/routes/participant";

export const Route = createFileRoute("/participant-360")({
  component: Participant360,
});
