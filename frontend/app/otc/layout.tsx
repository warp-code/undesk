import { SolanaProvider } from "./_providers/SolanaProvider";
import { SupabaseProvider } from "./_providers/SupabaseProvider";
import { OtcProvider } from "./_providers/OtcProvider";
import { DerivedKeysProvider } from "./_providers/DerivedKeysProvider";
import { MyBalancesProvider } from "./_providers/MyBalancesProvider";

export default function OtcLayout({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      <SupabaseProvider>
        <OtcProvider>
          <DerivedKeysProvider>
            <MyBalancesProvider>{children}</MyBalancesProvider>
          </DerivedKeysProvider>
        </OtcProvider>
      </SupabaseProvider>
    </SolanaProvider>
  );
}
