import { ProviderLocationProvider } from "../../components/provider-location-context";

export default function ProviderAppLayout({ children }: { children: React.ReactNode }) {
  return <ProviderLocationProvider>{children}</ProviderLocationProvider>;
}
