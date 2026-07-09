import { createFileRoute } from "@tanstack/react-router";
import RepDashboard from "@/components/rep/RepDashboard";
export const Route = createFileRoute("/rep/")({ component: RepDashboard });
