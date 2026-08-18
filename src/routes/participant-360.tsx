import { createFileRoute } from "@tanstack/react-router";
import { Participant360 } from "./customer-360";

export const Route = createFileRoute("/participant-360")({
  component: Participant360,
});
