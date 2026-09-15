import { ProviderLocationProvider } from "../../components/provider-location-context";
import { ProviderNav } from "../../components/provider-nav";

export default function ProviderAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProviderLocationProvider>
      {children}
      <ProviderNav />
    </ProviderLocationProvider>
  );
}
