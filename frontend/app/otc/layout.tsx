import { SolanaProvider } from "./_providers/SolanaProvider";
import { SupabaseProvider } from "./_providers/SupabaseProvider";
import { OtcProvider } from "./_providers/OtcProvider";
import { DerivedKeysProvider } from "./_providers/DerivedKeysProvider";

export default function OtcLayout({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      <SupabaseProvider>
        <OtcProvider>
          <DerivedKeysProvider>{children}</DerivedKeysProvider>
        </OtcProvider>
      </SupabaseProvider>
    </SolanaProvider>
  );
}
