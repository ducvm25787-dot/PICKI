import { RunnerSessionProvider } from "../../components/runner-session-context";

export default function RunnerAppLayout({ children }: { children: React.ReactNode }) {
  return <RunnerSessionProvider>{children}</RunnerSessionProvider>;
}
