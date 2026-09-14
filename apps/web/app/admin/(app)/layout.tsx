import { AdminSessionProvider } from "../../components/admin-session-context";

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return <AdminSessionProvider>{children}</AdminSessionProvider>;
}
